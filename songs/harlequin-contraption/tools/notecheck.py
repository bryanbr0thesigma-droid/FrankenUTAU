import json, sys, numpy as np, soundfile as sf
W=sys.argv[1]
p=json.loads(open(W+"/maki.svp","rb").read().decode("utf-8").rstrip("\x00"))
B=705600000; bpm=p["time"]["tempo"][0]["bpm"]
stems={0:"pass_a_Main_1",1:"pass_a_Main_2",2:"pass_a_Whisper",3:"pass_b_Harm_3",4:"pass_b_Harm_1",5:"pass_b_Harm_2",6:"pass_c_yell"}
lib={g["uuid"]:g for g in p["library"]}
for ti,name in stems.items():
    try: x,sr=sf.read(W+"/render/"+name+".wav", dtype="float32")
    except Exception as e: print(name,"missing"); continue
    m=x.mean(1) if x.ndim>1 else x
    t=p["tracks"][ti]
    groups=[(t["mainGroup"],0)]+[(lib[r["groupID"]],r["blickOffset"]) for r in t.get("groups",[])]
    silent=[]; n_notes=0; lv=[]
    for g,off in groups:
        for n in g["notes"]:
            if n["lyrics"] in ("br","-"): continue
            n_notes+=1
            a=(off+n["onset"])/B*60/bpm; b=(off+n["onset"]+n["duration"])/B*60/bpm
            seg=m[int(a*sr):int(b*sr)]
            lvl=20*np.log10(np.sqrt((seg**2).mean())+1e-9) if len(seg) else -200
            lv.append(lvl)
            if lvl < -50: silent.append((round(a,2), n["lyrics"], round(lvl)))
    rms=20*np.log10(np.sqrt((m**2).mean())+1e-9)
    print(f"{name:16s} {n_notes} notes, silent {len(silent)} {silent[:8]}  overall {rms:.1f} dB, note p50 {np.median(lv):.1f} p95 {np.percentile(lv,95):.1f}")
