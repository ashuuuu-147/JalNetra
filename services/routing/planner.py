"""Evacuation route planner over real OpenStreetMap road segments using NetworkX Dijkstra / A*.

Minimizes composite hazard-weighted cost:
  cost = distance_km * (1 + w_flood * flood_hazard + w_landslide * landslide_hazard) + closure_penalty

Explicitly preserves:
- 'Shelter location found — verification required' for unverified OSM shelters
- 'Hazard status unknown' for road segments without verified hazard telemetry
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

import networkx as nx

ROOT_DIR = Path(__file__).resolve().parents[2]
OSM_NETWORK_PATH = ROOT_DIR / "data" / "curated" / "osm_network.json"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class EvacuationRoutePlanner:
    """Builds a multi-edge NetworkX graph from real OSM corridors and computes safest feasible routes."""

    def __init__(self, osm_network_path: Path = OSM_NETWORK_PATH) -> None:
        self.osm_network_path = osm_network_path
        self.osm_data: Dict[str, Any] = {}
        self.reload()

    def reload(self) -> None:
        if self.osm_network_path.exists():
            self.osm_data = json.loads(self.osm_network_path.read_text(encoding="utf-8"))

    def get_shelters(self, verified_only: bool = False) -> List[Dict[str, Any]]:
        shelters = self.osm_data.get("shelters", [])
        enriched: List[Dict[str, Any]] = []
        for s in shelters:
            item = dict(s)
            is_verified = item.get("verification_status") == "verified"
            item["verification_label"] = (
                "Verified Official Relief Shelter"
                if is_verified
                else "Shelter location found — verification required"
            )
            if verified_only and not is_verified:
                continue
            enriched.append(item)
        return enriched

    def get_settlements(self) -> List[Dict[str, Any]]:
        return self.osm_data.get("settlements", [])

    def get_roads(self) -> List[Dict[str, Any]]:
        return self.osm_data.get("roads", [])

    def plan_route(
        self,
        origin_node: str,
        destination_shelter_id: Optional[str] = None,
        watershed_risk_map: Optional[Dict[str, float]] = None,
        flood_weight: float = 8.5,
        landslide_weight: float = 5.5,
        closure_penalty: float = 250.0,
        allow_unverified_shelter: bool = False,
    ) -> Dict[str, Any]:
        """Compute safest feasible route (and compare against shortest distance route) on real OSM geometry."""
        roads = self.get_roads()
        shelters = self.get_shelters(verified_only=False)
        settlements = {s["node_id"]: s for s in self.get_settlements()}
        risk_by_ws = watershed_risk_map or {}

        if not roads:
            return {
                "status": "unavailable",
                "message": "OpenStreetMap road network data unavailable.",
            }

        # Select target shelter(s)
        if destination_shelter_id:
            candidates = [s for s in shelters if s["shelter_id"] == destination_shelter_id]
        else:
            candidates = [s for s in shelters if s["verification_status"] == "verified"]
            if not candidates and allow_unverified_shelter:
                candidates = shelters

        if not candidates:
            return {
                "status": "empty",
                "message": "No matching shelter found for route planning.",
            }

        # Build NetworkX MultiGraph supporting parallel corridors (e.g. NH-3 Gorge vs Kamand-Kataula Ridge Bypass)
        g = nx.MultiGraph()
        for node_id, st in settlements.items():
            g.add_node(node_id, lat=st["lat"], lon=st["lon"], name=st["name"])

        for r in roads:
            u = r["from_node"]
            v = r["to_node"]
            dist_km = max(0.1, float(r["length_m"]) / 1000.0)
            ws_prob = float(risk_by_ws.get(r.get("watershed_id", ""), 0.35))

            raw_flood = r.get("flood_hazard_score")
            raw_slide = r.get("landslide_hazard_score")
            closure_state = r.get("closure_status", "hazard_status_unknown")

            if closure_state == "hazard_status_unknown" or raw_flood is None:
                eff_flood = 0.25
                eff_slide = 0.25
                hazard_status_label = "Hazard status unknown"
            else:
                # Modulate road flood & landslide hazard by current watershed risk probability
                multiplier = 0.55 + 1.15 * ws_prob
                eff_flood = round(min(1.0, float(raw_flood) * multiplier), 4)
                eff_slide = round(min(1.0, float(raw_slide) * (0.65 + 0.85 * ws_prob)), 4)
                if eff_flood >= 0.65 or closure_state == "closed":
                    hazard_status_label = "High Flood / Gorge Inundation Exposure"
                elif eff_slide >= 0.60:
                    hazard_status_label = "Elevated Slope / Landslide Exposure"
                else:
                    hazard_status_label = "Verified Elevated Corridor — Lower Hazard"

            c_pen = closure_penalty if (closure_state == "closed" or eff_flood >= 0.72) else 0.0
            composite_cost = dist_km * (1.0 + flood_weight * eff_flood + landslide_weight * eff_slide) + c_pen

            g.add_edge(
                u,
                v,
                key=r["road_id"],
                road_id=r["road_id"],
                osm_way_id=r["osm_way_id"],
                name=r["name"],
                highway_type=r["highway_type"],
                distance_km=round(dist_km, 2),
                duration_min=round(float(r.get("duration_s", dist_km * 90.0)) / 60.0, 1),
                flood_hazard=eff_flood,
                landslide_hazard=eff_slide,
                closure_status=closure_state,
                hazard_status_label=hazard_status_label,
                composite_cost=round(composite_cost, 3),
                coordinates=r["coordinates_geojson"]["coordinates"],
            )

        if origin_node not in g:
            origin_node = "mandi_town"

        best_plan: Optional[Dict[str, Any]] = None
        for sh in candidates:
            target_node = sh["node_id"]
            if target_node not in g:
                continue
            if origin_node == target_node:
                # Local terrace evacuation within the same town node + evaluate nearest alternate upland shelter
                other_verified = [
                    s for s in shelters if s["node_id"] != origin_node and s["verification_status"] == "verified"
                ]
                if other_verified and not destination_shelter_id:
                    continue

            try:
                safest_edges = self._dijkstra_multigraph(g, origin_node, target_node, weight_attr="composite_cost")
                shortest_edges = self._dijkstra_multigraph(g, origin_node, target_node, weight_attr="distance_km")
            except nx.NetworkXNoPath:
                continue

            safest_summary = self._summarize_path(g, origin_node, safest_edges, sh)
            shortest_summary = self._summarize_path(g, origin_node, shortest_edges, sh)
            safest_summary["shortest_alternative"] = {
                "total_distance_km": shortest_summary["total_distance_km"],
                "estimated_duration_min": shortest_summary["estimated_duration_min"],
                "max_flood_hazard": shortest_summary["max_flood_hazard"],
                "max_landslide_hazard": shortest_summary["max_landslide_hazard"],
                "composite_cost": shortest_summary["composite_cost"],
                "corridor_names": [seg["name"] for seg in shortest_summary["segments"]],
                "route_geojson": shortest_summary["route_geojson"],
                "avoided_high_hazard": safest_summary["corridor_ids"] != shortest_summary["corridor_ids"],
            }

            if best_plan is None or safest_summary["composite_cost"] < best_plan["composite_cost"]:
                best_plan = safest_summary

        if best_plan is None:
            return {
                "status": "unavailable",
                "message": "No feasible road path found between origin and shelter.",
            }
        return best_plan

    def _dijkstra_multigraph(
        self,
        g: nx.MultiGraph,
        source: str,
        target: str,
        weight_attr: str,
    ) -> List[Dict[str, Any]]:
        if source == target:
            return []
        nodes_path = nx.shortest_path(
            g,
            source=source,
            target=target,
            weight=lambda u, v, d: min(edge_data[weight_attr] for edge_data in d.values()),
        )
        chosen_edges: List[Dict[str, Any]] = []
        for u, v in zip(nodes_path[:-1], nodes_path[1:]):
            edge_bundle = g[u][v]
            best_key = min(edge_bundle, key=lambda k: edge_bundle[k][weight_attr])
            edge_info = dict(edge_bundle[best_key])
            # Orient coordinates from u -> v
            u_lon = g.nodes[u]["lon"]
            u_lat = g.nodes[u]["lat"]
            coords = list(edge_info["coordinates"])
            if coords:
                d_start = math.hypot(coords[0][0] - u_lon, coords[0][1] - u_lat)
                d_end = math.hypot(coords[-1][0] - u_lon, coords[-1][1] - u_lat)
                if d_end < d_start:
                    coords = list(reversed(coords))
            edge_info["oriented_coordinates"] = coords
            chosen_edges.append(edge_info)
        return chosen_edges

    def _summarize_path(
        self,
        g: nx.MultiGraph,
        origin_node: str,
        edges: List[Dict[str, Any]],
        shelter: Dict[str, Any],
    ) -> Dict[str, Any]:
        merged_coords: List[List[float]] = []
        segments: List[Dict[str, Any]] = []
        total_dist = 0.0
        total_dur = 0.0
        total_cost = 0.0
        max_flood = 0.0
        max_slide = 0.0
        unknown_segments = 0

        for e in edges:
            total_dist += float(e["distance_km"])
            total_dur += float(e["duration_min"])
            total_cost += float(e["composite_cost"])
            max_flood = max(max_flood, float(e["flood_hazard"]))
            max_slide = max(max_slide, float(e["landslide_hazard"]))
            if e["closure_status"] == "hazard_status_unknown":
                unknown_segments += 1
            for pt in e["oriented_coordinates"]:
                if not merged_coords or merged_coords[-1] != pt:
                    merged_coords.append(pt)
            segments.append(
                {
                    "road_id": e["road_id"],
                    "osm_way_id": e["osm_way_id"],
                    "name": e["name"],
                    "highway_type": e["highway_type"],
                    "distance_km": e["distance_km"],
                    "duration_min": e["duration_min"],
                    "flood_hazard": e["flood_hazard"],
                    "landslide_hazard": e["landslide_hazard"],
                    "closure_status": e["closure_status"],
                    "hazard_status_label": e["hazard_status_label"],
                    "composite_cost": e["composite_cost"],
                }
            )

        if not merged_coords:
            u_node = g.nodes[origin_node]
            merged_coords = [[u_node["lon"], u_node["lat"]], [shelter["lon"], shelter["lat"]]]

        is_verified = shelter.get("verification_status") == "verified"
        return {
            "status": "success",
            "algorithm": "NetworkX Hazard-Weighted Dijkstra/A* (Composite Cost)",
            "origin": {
                "node_id": origin_node,
                "name": g.nodes[origin_node]["name"],
                "lat": g.nodes[origin_node]["lat"],
                "lon": g.nodes[origin_node]["lon"],
            },
            "destination_shelter": {
                "shelter_id": shelter["shelter_id"],
                "name": shelter["name"],
                "lat": shelter["lat"],
                "lon": shelter["lon"],
                "elevation_m": shelter.get("elevation_m"),
                "verification_status": shelter["verification_status"],
                "verification_label": (
                    "Verified Official Relief Shelter"
                    if is_verified
                    else "Shelter location found — verification required"
                ),
                "verified_by": shelter.get("verified_by"),
                "osm_id": shelter.get("osm_id"),
            },
            "total_distance_km": round(total_dist, 2),
            "estimated_duration_min": round(total_dur, 1),
            "composite_cost": round(total_cost, 2),
            "max_flood_hazard": round(max_flood, 3),
            "max_landslide_hazard": round(max_slide, 3),
            "unknown_hazard_segments_count": unknown_segments,
            "corridor_ids": [s["road_id"] for s in segments],
            "segments": segments,
            "route_geojson": {
                "type": "Feature",
                "properties": {
                    "route_type": "safest_feasible",
                    "total_distance_km": round(total_dist, 2),
                    "max_flood_hazard": round(max_flood, 3),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": merged_coords,
                },
            },
            "attribution": "© OpenStreetMap contributors (ODbL 1.0)",
        }
