#!/usr/bin/env python3
"""Аудит классификации конфессий по public/data/parishes.geojson.

Дублирует логику src/lib/confessionRules.ts на Python, чтобы можно было
прогнать датасет без сборки фронтенда. Пишет:
  - public/data/confession-audit.json (распределение, мульти-точки, сэмплы)
Запуск: python3 scripts/audit_confessions.py
"""
from __future__ import annotations
import json, re, collections, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "parishes.geojson"
OUT = ROOT / "public" / "data" / "confession-audit.json"

KEYWORD_RULES = [
    (re.compile(r"армян|григориан|haykakan|armenian|სომხ", re.I), "armenian_apostolic"),
    (re.compile(r"католич|римско\s*-?\s*католич|catholic|roman cath|კათოლიკ", re.I), "roman_catholic"),
    (re.compile(r"лютеран|кирх|lutheran|kirche|kirch|ლუთერ", re.I), "lutheran"),
    (re.compile(r"синагог|еврейск|иудей|jewish|hebrew|synagogue|სინაგოგ|იუდე", re.I), "jewish"),
    (re.compile(r"молокан|molokan|მოლოკან", re.I), "molokan"),
    (re.compile(r"баптистск|баптистов|baptist church|baptist community|ბაპტისტურ", re.I), "baptist"),
    (re.compile(r"ассир|айсор|assyrian|aysor|ასირი", re.I), "assyrian"),
    (re.compile(r"греческ|греч\.|greek|ბერძნ", re.I), "greek_orthodox"),
    (re.compile(r"военн|полков|гарнизон|казач|military|regimental|garrison|cossack|სამხედრო", re.I), "orthodox_military"),
    (re.compile(r"единовер|старообряд|русский приход|русская церк|old believer|russian parish", re.I), "orthodox_russian"),
]

ARM_SETTLEMENTS = {"хертвиси","хизабавра","цхалтбила","ниноцминда","богдановка","александрополь","лори","гюмри"}
GERMAN_COLONIES = {"екатериненфельд","katharinenfeld","болниси","элизабетталь","elisabethtal","асурети","мариенфельд","marienfeld","сартичала","александерсхильф","alexanderhilf","петерсдорф","petersdorf","анненфельд","annenfeld","тифлисская колония","новотифлисская колония"}
MOLOKAN = {"гореловка","орловка","ефремовка","спасовка","ново михайловка","новомихайловка","михайловка молокан","воронцовка","башкичет","башкечет","привольное","родионовка","терновка","тамбовка"}
GREEK = {"цалка","бешташени","авранло","триалет","сантас","квемо хараба","земо хараба","цинцкаро","тарсон"}
JEWISH = {"ахалцихе","они","кулаши","лайлаши","сачхере","цхинвал","цхинвали","карели"}
RUS_PEASANT = {"бомборы","анастасиевка","свободное","михайловское","новогеоргиевское","александровское"}
MILITARY = {"ананури","сурам","сурами","ахалкалаки крепость","хорошани","цхинвал гарнизон"}

def norm(s):
    s = (s or "").lower().replace("ё","е")
    s = re.sub(r"[\s\-‐‑‒–—_().,;]+", " ", s)
    return s.strip()

def tokenize(s):
    if not s: return []
    return [t.strip() for t in re.split(r"\s*[|;/]\s*|\s+–\s+", s) if t.strip()]

def classify_token(tok):
    for rx, cat in KEYWORD_RULES:
        if rx.search(tok): return cat
    return None

def categorize(props):
    cats = set()
    has_orthodox = False
    ch = props.get("church") or {}
    strs = [ch] if isinstance(ch,str) else [ch.get(k,"") for k in ("ru","en","ka")]
    for s in strs:
        for tok in tokenize(s):
            c = classify_token(tok)
            if c: cats.add(c)
            else: has_orthodox = True
    s_n = norm((props.get("settlement") or {}).get("ru") or (props.get("settlement") or {}).get("en"))
    u_n = norm((props.get("uezd") or {}).get("ru") or (props.get("uezd") or {}).get("en"))
    r_n = norm((props.get("region") or {}).get("ru") or (props.get("region") or {}).get("en"))
    area_applied = None
    keep_default = True
    if re.search(r"ахалкалак", u_n, re.I) or re.search(r"ахалкалак", r_n, re.I):
        cats.add("armenian_apostolic"); area_applied="ахалкалакский регион"; keep_default=True
    elif re.search(r"греческ", u_n, re.I) or re.search(r"греческ", r_n, re.I):
        cats.add("greek_orthodox"); area_applied="греческое (этнотерр.)"; keep_default=False
    elif s_n in ARM_SETTLEMENTS:
        cats.add("armenian_apostolic"); area_applied="armenian village"; keep_default=False
    elif s_n in GERMAN_COLONIES:
        cats.add("lutheran"); area_applied="german colony"; keep_default=False
    elif s_n in MOLOKAN:
        cats.add("molokan"); area_applied="molokan/duhobor"; keep_default=False
    elif s_n in GREEK:
        cats.add("greek_orthodox"); area_applied="greek village"; keep_default=False
    elif s_n in JEWISH:
        cats.add("jewish"); area_applied="jewish town"; keep_default=True
    elif s_n in RUS_PEASANT:
        cats.add("orthodox_russian"); area_applied="russian peasant village"; keep_default=False
    elif s_n in MILITARY:
        cats.add("orthodox_military"); area_applied="military fort"; keep_default=True
    if not cats:
        cats.add("orthodox_georgian")
    elif has_orthodox and keep_default:
        cats.add("orthodox_georgian")
    return sorted(cats), area_applied

def main():
    data = json.loads(DATA.read_text())
    feats = data["features"]
    dist = collections.Counter()
    multi_dist = collections.Counter()
    areas = collections.Counter()
    samples_by_cat = collections.defaultdict(list)
    multi_samples = []
    for f in feats:
        props = f.get("properties") or {}
        cats, area = categorize(props)
        for c in cats: dist[c] += 1
        multi_dist[len(cats)] += 1
        if area: areas[area] += 1
        s = (props.get("settlement") or {}).get("ru","")
        ch = (props.get("church") or {}).get("ru","")
        for c in cats:
            if len(samples_by_cat[c]) < 8:
                samples_by_cat[c].append({"settlement": s, "church": ch[:120], "cats": cats})
        if len(cats) > 1 and len(multi_samples) < 30:
            multi_samples.append({"settlement": s, "church": ch[:120], "cats": cats})
    out = {
        "totalFeatures": len(feats),
        "distribution": dict(dist.most_common()),
        "multiCategoryDistribution": dict(sorted(multi_dist.items())),
        "areaRuleHits": dict(areas.most_common()),
        "samplesByCategory": samples_by_cat,
        "multiCategorySamples": multi_samples,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"Wrote {OUT}")
    print("Distribution:")
    for k,v in dist.most_common():
        print(f"  {k:24s} {v:5d}  ({v*100/len(feats):.1f}%)")
    print(f"Multi-category points: {sum(v for k,v in multi_dist.items() if k>1)} / {len(feats)}")
    print("Area-rule hits:")
    for k,v in areas.most_common():
        print(f"  {k:30s} {v}")

if __name__ == "__main__":
    main()
