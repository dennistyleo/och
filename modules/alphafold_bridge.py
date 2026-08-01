"""
Module: alphafold_bridge
Version: 1.0.0
Description: Fetches AlphaFold protein structure metadata, UniProt annotations,
             and ChEMBL approved drug-target interactions for biomarker anomalies.
             Uses SQLite cache (data/alphafold_cache.db) with 30-day TTL.
             Pre-warms cache at startup for all known cardiovascular/metabolic proteins.
"""

import sqlite3
import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# ── Cache configuration ───────────────────────────────────────────────────────
_DB_PATH = Path(__file__).parent.parent / "data" / "alphafold_cache.db"
_PDB_DIR = Path(__file__).parent.parent / "data" / "pdb_cache"
_CACHE_TTL_SECONDS = 30 * 24 * 3600  # 30 days

# ── API endpoints ─────────────────────────────────────────────────────────────
_AF_API        = "https://alphafold.ebi.ac.uk/api/prediction/{uniprot_id}"
_UNIPROT_API   = "https://rest.uniprot.org/uniprotkb/{uniprot_id}?format=json"
_CHEMBL_TARGET = "https://www.ebi.ac.uk/chembl/api/data/target?target_components__accession={uniprot_id}&format=json"
_CHEMBL_MECH   = "https://www.ebi.ac.uk/chembl/api/data/mechanism?target_chembl_id={target_id}&format=json&limit=50"
_CHEMBL_MOL    = "https://www.ebi.ac.uk/chembl/api/data/molecule/{chembl_id}?format=json"

# ── Biomarker → Protein Target Map ───────────────────────────────────────────
BIOMARKER_PROTEIN_MAP: Dict[str, List[Dict[str, Any]]] = {
    "LDL": [
        {"uniprot": "P55000", "name": "PCSK9", "full_name": "Proprotein convertase subtilisin/kexin type 9",
         "anomaly_direction": "high",
         "pathological_role": "Degrades LDL receptors on liver cells, causing LDL accumulation in blood",
         "domain_note": "Catalytic domain (residues 153-421) adopts stable beta-sheet fold; Asp374 is key binding site",
         "drug_mechanism_context": "Blocking PCSK9 restores LDL receptor recycling, reducing blood LDL by 50-60%"},
        {"uniprot": "P04035", "name": "HMGCR", "full_name": "3-hydroxy-3-methylglutaryl-coenzyme A reductase",
         "anomaly_direction": "high",
         "pathological_role": "Rate-limiting enzyme in cholesterol biosynthesis — overactivity drives LDL production",
         "domain_note": "Catalytic domain (residues 428-888); statin binding site in HMG-CoA binding pocket",
         "drug_mechanism_context": "Statins competitively inhibit the HMG-CoA binding pocket, reducing liver LDL synthesis"},
    ],
    "HDL": [
        {"uniprot": "O94911", "name": "ABCA1", "full_name": "ATP-binding cassette sub-family A member 1",
         "anomaly_direction": "low",
         "pathological_role": "Cholesterol efflux transporter — reduced ABCA1 activity lowers HDL particle formation",
         "domain_note": "Two transmembrane domains and two nucleotide-binding domains; ATP hydrolysis drives cholesterol export",
         "drug_mechanism_context": "Niacin and fibrates upregulate ABCA1 transcription, increasing cholesterol efflux and HDL"},
    ],
    "TG": [
        {"uniprot": "P06858", "name": "LPL", "full_name": "Lipoprotein lipase",
         "anomaly_direction": "high",
         "pathological_role": "Reduced LPL activity impairs TG-rich lipoprotein clearance, raising plasma triglycerides",
         "domain_note": "Lid domain (residues 216-239) gates access to the catalytic serine; dimer interface required for activity",
         "drug_mechanism_context": "Fibrates activate PPARalpha, increasing LPL gene expression. Omega-3s activate LPL directly."},
        {"uniprot": "Q9Y5C1", "name": "ANGPTL3", "full_name": "Angiopoietin-related protein 3",
         "anomaly_direction": "high",
         "pathological_role": "Inhibits LPL activity — elevated ANGPTL3 suppresses TG clearance",
         "domain_note": "Coiled-coil domain mediates LPL inhibition; fibronectin type III domain for receptor binding",
         "drug_mechanism_context": "Evinacumab (monoclonal Ab) blocks ANGPTL3, restoring LPL-mediated TG clearance"},
    ],
    "BP_SYS": [
        {"uniprot": "P12821", "name": "ACE", "full_name": "Angiotensin-converting enzyme",
         "anomaly_direction": "high",
         "pathological_role": "Converts angiotensin I to angiotensin II, causing vasoconstriction and BP elevation",
         "domain_note": "Two zinc metalloprotease domains (N-domain: His383, His387, Glu411; C-domain: His959, His963, Glu987)",
         "drug_mechanism_context": "ACE inhibitors (ramipril, lisinopril) chelate the catalytic zinc, preventing Ang II formation"},
        {"uniprot": "P30556", "name": "AGTR1", "full_name": "Angiotensin II receptor type 1",
         "anomaly_direction": "high",
         "pathological_role": "GPCR for Ang II — mediates vasoconstriction, aldosterone release, and renal sodium retention",
         "domain_note": "7-transmembrane GPCR; Ang II binds extracellular loop 2 and TM helices III, IV, VII",
         "drug_mechanism_context": "ARBs (losartan, valsartan) bind TM VII domain, blocking Ang II without ACE side effects"},
    ],
    "BP_DIA": [
        {"uniprot": "P30556", "name": "AGTR1", "full_name": "Angiotensin II receptor type 1",
         "anomaly_direction": "high",
         "pathological_role": "Elevated diastolic BP reflects sustained Ang II-mediated peripheral resistance",
         "domain_note": "GPCR — 7-transmembrane helices; calcium channel coupling drives vascular smooth muscle contraction",
         "drug_mechanism_context": "Calcium channel blockers (amlodipine) block L-type VGCC, relaxing vascular smooth muscle"},
    ],
    "GLU": [
        {"uniprot": "P43220", "name": "GLP1R", "full_name": "Glucagon-like peptide 1 receptor",
         "anomaly_direction": "high",
         "pathological_role": "Impaired GLP-1 signalling reduces insulin secretion and glucose uptake in hyperglycaemia",
         "domain_note": "Class B GPCR; N-terminal ECD (residues 24-145) binds GLP-1 peptide; TM bundle transmits signal",
         "drug_mechanism_context": "GLP-1 agonists (semaglutide, liraglutide) mimic GLP-1 at the ECD, amplifying insulin release"},
        {"uniprot": "P27487", "name": "DPP4", "full_name": "Dipeptidyl peptidase 4",
         "anomaly_direction": "high",
         "pathological_role": "Rapidly degrades endogenous GLP-1, reducing its glucose-lowering effect",
         "domain_note": "Serine protease; Ser630/His740/Asp708 catalytic triad; homodimer required for full activity",
         "drug_mechanism_context": "Gliptins (sitagliptin, saxagliptin) occupy the Ser630 pocket, blocking GLP-1 degradation"},
    ],
    "HBA1C": [
        {"uniprot": "P43220", "name": "GLP1R", "full_name": "Glucagon-like peptide 1 receptor",
         "anomaly_direction": "high",
         "pathological_role": "Chronic hyperglycaemia reflects sustained GLP-1/insulin axis impairment",
         "domain_note": "Class B GPCR; semaglutide binds ECD + TM pocket, stabilized by fatty acid chain",
         "drug_mechanism_context": "Weekly semaglutide reduces HbA1c by ~1.5% by sustaining GLP-1R activation throughout the week"},
        {"uniprot": "P27487", "name": "DPP4", "full_name": "Dipeptidyl peptidase 4",
         "anomaly_direction": "high",
         "pathological_role": "DPP4 overactivity in T2DM accelerates GLP-1 degradation, worsening glycaemic control",
         "domain_note": "Beta-propeller domain (residues 55-496) + alpha/beta-hydrolase catalytic domain; Glu205 gates substrate entry",
         "drug_mechanism_context": "DPP-4 inhibitors reduce HbA1c by ~0.7% with minimal hypoglycaemia risk"},
    ],
    "TC": [
        {"uniprot": "P55000", "name": "PCSK9", "full_name": "Proprotein convertase subtilisin/kexin type 9",
         "anomaly_direction": "high",
         "pathological_role": "Total cholesterol elevation driven by PCSK9-mediated LDL receptor downregulation",
         "domain_note": "Prodomain (31-152) + catalytic (153-421) + C-terminal CHRD domain (449-692)",
         "drug_mechanism_context": "Inclisiran (siRNA) silences PCSK9 gene transcription, reducing PCSK9 protein production by ~80%"},
    ],
}

# ── Seed drugs (fallback when ChEMBL is unavailable) ─────────────────────────
_SEED_DRUGS: Dict[str, List[Dict]] = {
    "P55000": [
        {"name": "Evolocumab (Repatha)", "mechanism": "Monoclonal antibody — binds PCSK9 catalytic domain at Asp374, blocking LDL receptor interaction", "type": "Biological", "max_phase": 4},
        {"name": "Alirocumab (Praluent)", "mechanism": "Monoclonal antibody — prevents PCSK9 binding to LDL receptor", "type": "Biological", "max_phase": 4},
        {"name": "Inclisiran (Leqvio)", "mechanism": "siRNA — silences PCSK9 gene transcription in hepatocytes (6-month dosing)", "type": "Small molecule (RNA)", "max_phase": 4},
    ],
    "P04035": [
        {"name": "Atorvastatin (Lipitor)", "mechanism": "Competitive inhibitor of HMGCR HMG-CoA binding pocket — reduces LDL ~50%", "type": "Small molecule", "max_phase": 4},
        {"name": "Rosuvastatin (Crestor)", "mechanism": "Most potent statin — HMGCR active site inhibition, reduces LDL ~55%", "type": "Small molecule", "max_phase": 4},
        {"name": "Simvastatin (Zocor)", "mechanism": "Prodrug statin — hydrolysed to active form in liver, HMGCR inhibition", "type": "Small molecule", "max_phase": 4},
    ],
    "O94911": [
        {"name": "Niacin (extended-release)", "mechanism": "Upregulates ABCA1 gene expression via PPARgamma-LXR axis, raising HDL 15-30%", "type": "Small molecule (vitamin)", "max_phase": 4},
        {"name": "Fenofibrate (Tricor)", "mechanism": "PPARalpha agonist — upregulates ABCA1 and ApoA-I, increasing reverse cholesterol transport", "type": "Small molecule", "max_phase": 4},
    ],
    "P06858": [
        {"name": "Fenofibrate (Tricor)", "mechanism": "PPARalpha agonist — upregulates LPL expression, clearing TG-rich particles", "type": "Small molecule", "max_phase": 4},
        {"name": "Omega-3 fatty acids (Vascepa)", "mechanism": "Activates PPARalpha + GPR120 — directly stimulates LPL, reduces hepatic VLDL-TG output", "type": "Natural product", "max_phase": 4},
    ],
    "Q9Y5C1": [
        {"name": "Evinacumab (Evkeeza)", "mechanism": "Monoclonal antibody — blocks ANGPTL3 coiled-coil domain, restoring LPL-mediated TG clearance", "type": "Biological", "max_phase": 4},
    ],
    "P12821": [
        {"name": "Ramipril (Altace)", "mechanism": "Chelates catalytic Zn2+ in ACE C-domain — prevents Ang I to Ang II conversion", "type": "Small molecule (prodrug)", "max_phase": 4},
        {"name": "Lisinopril (Zestril)", "mechanism": "Directly inhibits ACE active site — reduces Ang II and aldosterone", "type": "Small molecule", "max_phase": 4},
        {"name": "Perindopril (Coversyl)", "mechanism": "Potent ACE inhibitor with long half-life — preferred for cardioprotection", "type": "Small molecule (prodrug)", "max_phase": 4},
    ],
    "P30556": [
        {"name": "Losartan (Cozaar)", "mechanism": "Competitive AT1 receptor antagonist — blocks Ang II at TM VII binding pocket", "type": "Small molecule", "max_phase": 4},
        {"name": "Valsartan (Diovan)", "mechanism": "High-affinity AT1 blocker — reduces peripheral vascular resistance and cardiac afterload", "type": "Small molecule", "max_phase": 4},
        {"name": "Amlodipine (Norvasc)", "mechanism": "L-type calcium channel blocker — relaxes vascular smooth muscle, reduces BP", "type": "Small molecule", "max_phase": 4},
    ],
    "P43220": [
        {"name": "Semaglutide (Ozempic/Wegovy)", "mechanism": "GLP-1 analogue — binds ECD + TM pocket of GLP1R, amplifies insulin secretion, reduces appetite", "type": "Biological (peptide)", "max_phase": 4},
        {"name": "Liraglutide (Victoza)", "mechanism": "Fatty acid-conjugated GLP-1 analogue — daily dosing, sustained GLP1R activation", "type": "Biological (peptide)", "max_phase": 4},
        {"name": "Dulaglutide (Trulicity)", "mechanism": "GLP-1 analogue fused to IgG4 Fc — weekly dosing, reduces HbA1c ~1.5%", "type": "Biological", "max_phase": 4},
    ],
    "P27487": [
        {"name": "Sitagliptin (Januvia)", "mechanism": "Occupies Ser630 catalytic pocket of DPP4, preventing GLP-1 degradation — raises endogenous GLP-1 2-3x", "type": "Small molecule", "max_phase": 4},
        {"name": "Saxagliptin (Onglyza)", "mechanism": "Covalent-competitive DPP4 inhibitor — forms hemiketal with Ser630", "type": "Small molecule", "max_phase": 4},
    ],
    "P35557": [
        {"name": "Dorzagliatin (Glucokinase activator)", "mechanism": "Binds GCK allosteric site (residues 62-72), increasing glucose affinity and insulin secretion", "type": "Small molecule", "max_phase": 4},
    ],
}


# ── SQLite cache init ─────────────────────────────────────────────────────────

def _init_db() -> sqlite3.Connection:
    os.makedirs(_DB_PATH.parent, exist_ok=True)
    os.makedirs(_PDB_DIR, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS protein_cache (
            uniprot_id   TEXT PRIMARY KEY,
            af_data      TEXT,
            uniprot_data TEXT,
            pdb_url      TEXT,
            plddt_avg    REAL,
            function_text TEXT,
            active_sites TEXT,
            pdb_local    TEXT,
            fetched_at   INTEGER
        );
        CREATE TABLE IF NOT EXISTS drug_cache (
            uniprot_id      TEXT PRIMARY KEY,
            chembl_target_id TEXT,
            drugs_json      TEXT,
            fetched_at      INTEGER
        );
    """)
    conn.commit()
    return conn


_db_conn: Optional[sqlite3.Connection] = None

def _get_db() -> sqlite3.Connection:
    global _db_conn
    if _db_conn is None:
        _db_conn = _init_db()
    return _db_conn


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _http_get(url: str, timeout: int = 15) -> Optional[Any]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OCM-AlphaFold-Bridge/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.warning("[AF_BRIDGE] GET failed %s: %s", url, e)
        return None


def _http_download(url: str, dest: Path, timeout: int = 30) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OCM-AlphaFold-Bridge/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            dest.write_bytes(resp.read())
        return True
    except Exception as e:
        logger.warning("[AF_BRIDGE] Download failed %s: %s", url, e)
        return False


# ── API fetch functions ───────────────────────────────────────────────────────

def _fetch_alphafold(uniprot_id: str) -> Dict[str, Any]:
    url = _AF_API.format(uniprot_id=uniprot_id)
    data = _http_get(url)
    if not data or not isinstance(data, list) or not data:
        return {"plddt_avg": None, "pdb_url": None, "mmcif_url": None}
    entry = data[0]
    # AlphaFold DB uses 'globalMetricValue' for the mean pLDDT score
    plddt_avg = entry.get("globalMetricValue") or entry.get("confidenceScore")
    # Fraction of residues with very high confidence (pLDDT >= 90)
    frac_very_high = entry.get("fractionPlddtVeryHigh", 0) or 0
    frac_confident = entry.get("fractionPlddtConfident", 0) or 0
    return {
        "plddt_avg":          round(float(plddt_avg), 2) if plddt_avg is not None else None,
        "frac_very_high":     round(float(frac_very_high) * 100, 1),
        "frac_confident":     round(float(frac_confident) * 100, 1),
        "pdb_url":            entry.get("pdbUrl"),
        "mmcif_url":          entry.get("cifUrl"),
        "model_version":      entry.get("latestVersion"),
        "organism":           entry.get("organismScientificName"),
        "sequence_length":    (entry.get("sequenceEnd") or 0) - (entry.get("sequenceStart") or 0),
    }


def _fetch_uniprot(uniprot_id: str) -> Dict[str, Any]:
    url = _UNIPROT_API.format(uniprot_id=uniprot_id)
    data = _http_get(url)
    if not data:
        return {"function_text": "", "active_sites": []}
    function_text = ""
    try:
        # UniProt v2 JSON: protein name is under proteinDescription.recommendedName.fullName.value
        pd_block = data.get("proteinDescription", {})
        rec_name = pd_block.get("recommendedName", {})
        fn_val   = rec_name.get("fullName", {}).get("value", "")
        for c in data.get("comments", []):
            if c.get("commentType") == "FUNCTION":
                texts = c.get("texts", [])
                if texts:
                    function_text = texts[0].get("value", "")
                    break
        if not function_text and fn_val:
            function_text = fn_val  # fallback to protein full name
    except Exception:
        pass
    active_sites = []
    try:
        for feat in data.get("features", []):
            if feat.get("type") in ("Active site", "Binding site", "Metal binding"):
                pos = feat.get("location", {}).get("start", {}).get("value")
                desc = feat.get("description", "")
                if pos:
                    active_sites.append({"position": pos, "description": desc})
    except Exception:
        pass
    return {"function_text": function_text[:500], "active_sites": active_sites[:10]}


def _fetch_chembl_drugs(uniprot_id: str) -> List[Dict]:
    target_data = _http_get(_CHEMBL_TARGET.format(uniprot_id=uniprot_id))
    if not target_data:
        return []
    targets = target_data.get("targets", [])
    if not targets:
        return []
    target_id = targets[0].get("target_chembl_id")
    if not target_id:
        return []
    mech_data = _http_get(_CHEMBL_MECH.format(target_id=target_id))
    if not mech_data:
        return []
    drugs = []
    seen = set()
    for mech in mech_data.get("mechanisms", []):
        mol_id = mech.get("molecule_chembl_id")
        if not mol_id or mol_id in seen:
            continue
        seen.add(mol_id)
        mol_data = _http_get(_CHEMBL_MOL.format(chembl_id=mol_id))
        if not mol_data:
            continue
        max_phase = mol_data.get("max_phase", 0)
        try:
            max_phase = int(max_phase) if max_phase is not None else 0
        except (ValueError, TypeError):
            max_phase = 0
        if max_phase < 4:
            continue
        drugs.append({
            "name":      mol_data.get("pref_name") or mol_id,
            "mechanism": mech.get("mechanism_of_action", ""),
            "type":      mol_data.get("molecule_type", "Small molecule"),
            "max_phase": max_phase,
            "chembl_id": mol_id,
        })
    return drugs[:8]


# ── Cache-aware fetch ─────────────────────────────────────────────────────────

def fetch_protein_data(uniprot_id: str, force_refresh: bool = False) -> Dict[str, Any]:
    conn = _get_db()
    now  = int(time.time())
    if not force_refresh:
        row = conn.execute("SELECT * FROM protein_cache WHERE uniprot_id=?", (uniprot_id,)).fetchone()
        if row and (now - (row["fetched_at"] or 0)) < _CACHE_TTL_SECONDS:
            af_data = json.loads(row["af_data"] or "{}")
            drug_row = conn.execute("SELECT drugs_json FROM drug_cache WHERE uniprot_id=?", (uniprot_id,)).fetchone()
            drugs = json.loads(drug_row["drugs_json"] or "[]") if drug_row else _SEED_DRUGS.get(uniprot_id, [])
            return {
                "plddt_avg":    row["plddt_avg"],
                "pdb_url":      row["pdb_url"],
                "pdb_local":    row["pdb_local"],
                "function_text":row["function_text"],
                "active_sites": json.loads(row["active_sites"] or "[]"),
                "drugs":        drugs,
                **af_data,
            }
    logger.info("[AF_BRIDGE] Fetching fresh data for %s", uniprot_id)
    af_data = _fetch_alphafold(uniprot_id)
    up_data = _fetch_uniprot(uniprot_id)
    drugs   = _fetch_chembl_drugs(uniprot_id) or _SEED_DRUGS.get(uniprot_id, [])
    pdb_local = None
    if af_data.get("mmcif_url"):
        dest = _PDB_DIR / "AF-{}-F1.cif".format(uniprot_id)
        if not dest.exists() or force_refresh:
            if _http_download(af_data["mmcif_url"], dest):
                pdb_local = str(dest)
        else:
            pdb_local = str(dest)
    conn.execute(
        "INSERT OR REPLACE INTO protein_cache (uniprot_id,af_data,uniprot_data,pdb_url,plddt_avg,function_text,active_sites,pdb_local,fetched_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (uniprot_id, json.dumps(af_data), json.dumps(up_data), af_data.get("pdb_url"), af_data.get("plddt_avg"), up_data.get("function_text",""), json.dumps(up_data.get("active_sites",[])), pdb_local, now)
    )
    conn.execute(
        "INSERT OR REPLACE INTO drug_cache (uniprot_id,chembl_target_id,drugs_json,fetched_at) VALUES (?,?,?,?)",
        (uniprot_id, None, json.dumps(drugs), now)
    )
    conn.commit()
    return {"plddt_avg": af_data.get("plddt_avg"), "pdb_url": af_data.get("pdb_url"), "mmcif_url": af_data.get("mmcif_url"), "pdb_local": pdb_local, "function_text": up_data.get("function_text",""), "active_sites": up_data.get("active_sites",[]), "drugs": drugs, **af_data}


# ── Main public API ───────────────────────────────────────────────────────────

def build_protein_structure_data(anomalous_biomarkers: List[str]) -> List[Dict[str, Any]]:
    """Build protein structure data for all anomalous biomarkers."""
    results = []
    seen_uniprots = set()
    for bm in anomalous_biomarkers:
        for target in BIOMARKER_PROTEIN_MAP.get(bm, []):
            uniprot = target["uniprot"]
            if uniprot in seen_uniprots:
                continue
            seen_uniprots.add(uniprot)
            try:
                pd = fetch_protein_data(uniprot)
            except Exception as e:
                logger.error("[AF_BRIDGE][E001] %s: %s", uniprot, e)
                pd = {"plddt_avg": None, "drugs": _SEED_DRUGS.get(uniprot, []), "pdb_local": None, "pdb_url": None, "mmcif_url": None}
            plddt = pd.get("plddt_avg")
            plddt_label = ("Very High" if plddt and plddt >= 90 else
                           "High"      if plddt and plddt >= 70 else
                           "Medium"    if plddt and plddt >= 50 else
                           "Low"       if plddt else "Unknown")
            results.append({
                "biomarker":              bm,
                "uniprot":                uniprot,
                "name":                   target["name"],
                "full_name":              target["full_name"],
                "anomaly_direction":      target["anomaly_direction"],
                "pathological_role":      target["pathological_role"],
                "domain_note":            target["domain_note"],
                "drug_mechanism_context": target["drug_mechanism_context"],
                "function_text":          pd.get("function_text", ""),
                "plddt_avg":              plddt,
                "plddt_label":            plddt_label,
                "active_sites":           pd.get("active_sites", []),
                "pdb_url":                pd.get("pdb_url"),
                "mmcif_url":              pd.get("mmcif_url"),
                "pdb_local":              pd.get("pdb_local"),
                "drugs":                  pd.get("drugs", []),
                "disclaimer":             "Structure predicted by AlphaFold AI (Google DeepMind / EMBL-EBI). pLDDT>=90 = very high confidence. Not a substitute for experimental crystallography. CC-BY-4.0 license.",
                "alphafold_db_url":       "https://alphafold.ebi.ac.uk/entry/{}".format(uniprot),
            })
    return results


def prewarm_cache() -> None:
    """Pre-fetch and cache all known proteins at startup. Runs in background thread."""
    all_uniprots = set()
    for targets in BIOMARKER_PROTEIN_MAP.values():
        for t in targets:
            all_uniprots.add(t["uniprot"])
    logger.info("[AF_BRIDGE] Pre-warming cache for %d proteins...", len(all_uniprots))
    for uniprot in sorted(all_uniprots):
        try:
            row = _get_db().execute("SELECT fetched_at FROM protein_cache WHERE uniprot_id=?", (uniprot,)).fetchone()
            if row and (int(time.time()) - (row["fetched_at"] or 0)) < _CACHE_TTL_SECONDS:
                logger.debug("[AF_BRIDGE] Cache hit %s", uniprot)
                continue
            fetch_protein_data(uniprot)
            time.sleep(0.5)  # Rate limit
        except Exception as e:
            logger.warning("[AF_BRIDGE] Pre-warm %s: %s", uniprot, e)
    logger.info("[AF_BRIDGE] Pre-warm complete.")
