#!/usr/bin/env python3
"""FloodGuard AI: real-data-only training entry point."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from typing import Dict, Tuple
import joblib, numpy as np, pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "rain_1h","rain_3h","rain_6h","rain_12h","rain_24h","rain_48h","rain_72h",
    "forecast_rain_6h","forecast_rain_24h","rain_anomaly_24h","antecedent_precipitation_index",
    "soil_water_l1","soil_water_l2","soil_water_l3","soil_water_l4","runoff","snow_depth","snowmelt",
    "elevation","slope","aspect","curvature","twi","tri","flow_accumulation","distance_to_stream",
    "drainage_density","historical_flood_frequency","landslide_density","distance_to_landslide","permanent_water_fraction",
]

def load_validate(data_path: Path, provenance_path: Path) -> pd.DataFrame:
    if not data_path.exists() or not provenance_path.exists():
        raise FileNotFoundError("Real training parquet and provenance JSON are required.")
    prov = json.loads(provenance_path.read_text(encoding="utf-8"))
    if prov.get("synthetic_rows", 0) != 0 or prov.get("mock_rows", 0) != 0:
        raise ValueError("Refusing to train: provenance reports synthetic/mock rows.")
    if not prov.get("sources"):
        raise ValueError("Refusing to train: provenance contains no sources.")
    df = pd.read_parquet(data_path)
    required = {"event_id","event_time","label"} | set(FEATURES)
    missing = sorted(required - set(df.columns))
    if missing: raise ValueError(f"Missing columns: {missing}")
    if df.empty: raise ValueError("Empty dataset.")
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True, errors="coerce")
    if df["event_time"].isna().any(): raise ValueError("Invalid event_time values.")
    labels = set(pd.to_numeric(df["label"], errors="coerce").dropna().unique())
    if not labels.issubset({0,1}): raise ValueError(f"Label must be 0/1, found {labels}")
    return df

def temporal_group_split(df: pd.DataFrame) -> Tuple[pd.DataFrame,pd.DataFrame,pd.DataFrame]:
    events = df[["event_id","event_time"]].drop_duplicates("event_id").sort_values("event_time").reset_index(drop=True)
    n = len(events)
    if n < 12: raise ValueError(f"Only {n} unique events; need a larger event corpus.")
    a, b = max(1,int(round(n*0.70))), max(2,int(round(n*0.85)))
    train_e, val_e, test_e = map(set,(events.iloc[:a].event_id, events.iloc[a:b].event_id, events.iloc[b:].event_id))
    train, val, test = df[df.event_id.isin(train_e)].copy(), df[df.event_id.isin(val_e)].copy(), df[df.event_id.isin(test_e)].copy()
    if train_e & val_e or train_e & test_e or val_e & test_e: raise AssertionError("Event leakage")
    return train,val,test

def m(y,p,t):
    pred=(p>=t).astype(int); tn,fp,fn,tp=map(float,confusion_matrix(y,pred,labels=[0,1]).ravel())
    return {"precision":float(precision_score(y,pred,zero_division=0)),"recall":float(recall_score(y,pred,zero_division=0)),"f1":float(f1_score(y,pred,zero_division=0)),"pr_auc":float(average_precision_score(y,p)),"roc_auc":float(roc_auc_score(y,p)) if len(np.unique(y))==2 else float("nan"),"brier":float(brier_score_loss(y,p)),"tn":tn,"fp":fp,"fn":fn,"tp":tp}

def threshold(y,p):
    vals=[(float(f1_score(y,p>=t,zero_division=0)),float(t)) for t in np.linspace(.05,.95,37)]
    return max(vals)[1]

def models() -> Dict[str,object]:
    out={
        "logistic_regression":Pipeline([("scale",StandardScaler()),("clf",LogisticRegression(max_iter=2000,class_weight="balanced"))]),
        "random_forest":RandomForestClassifier(n_estimators=500,max_depth=18,min_samples_leaf=2,n_jobs=-1,class_weight="balanced_subsample",random_state=42),
    }
    try:
        from xgboost import XGBClassifier
        out["xgboost"]=XGBClassifier(n_estimators=500,max_depth=7,learning_rate=.05,subsample=.85,colsample_bytree=.85,reg_lambda=1.0,objective="binary:logistic",eval_metric="logloss",tree_method="hist",random_state=42)
    except Exception as e: print("XGBoost unavailable:",e)
    try:
        from lightgbm import LGBMClassifier
        out["lightgbm"]=LGBMClassifier(n_estimators=500,learning_rate=.05,num_leaves=63,subsample=.85,colsample_bytree=.85,random_state=42)
    except Exception as e: print("LightGBM unavailable:",e)
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--data",default="data/curated/training_features.parquet"); ap.add_argument("--provenance",default="data/curated/training_provenance.json"); ap.add_argument("--out",default="artifacts"); args=ap.parse_args()
    out=Path(args.out); (out/"models").mkdir(parents=True,exist_ok=True); (out/"metrics").mkdir(parents=True,exist_ok=True)
    df=load_validate(Path(args.data),Path(args.provenance)); train,val,test=temporal_group_split(df)
    Xtr,ytr=train[FEATURES],train.label.astype(int); Xv,yv=val[FEATURES],val.label.astype(int); Xt,yt=test[FEATURES],test.label.astype(int)
    results={}
    for name,est in models().items():
        pipe=Pipeline([("impute",SimpleImputer(strategy="median")),("estimator",est)]); pipe.fit(Xtr,ytr)
        pv=pipe.predict_proba(Xv)[:,1]; t=threshold(yv.to_numpy(),pv)
        cal=CalibratedClassifierCV(pipe,method="sigmoid",cv="prefit"); cal.fit(Xv,yv)
        pt=cal.predict_proba(Xt)[:,1]; mm=m(yt.to_numpy(),pt,t); mm.update({"model":name,"validation_threshold":t}); results[name]=mm
        joblib.dump(cal,out/"models"/f"floodguard_{name}.joblib")
    best=min(results,key=lambda k:(-results[k]["pr_auc"],results[k]["brier"],-results[k]["recall"]))
    summary={"best_model":best,"dataset_rows":int(len(df)),"unique_events":int(df.event_id.nunique()),"splits":{"train_rows":len(train),"val_rows":len(val),"test_rows":len(test),"train_events":train.event_id.nunique(),"val_events":val.event_id.nunique(),"test_events":test.event_id.nunique()},"models":results}
    (out/"metrics"/"training_metrics.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    print(json.dumps(summary,indent=2))

if __name__=="__main__": main()
