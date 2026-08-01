/**
 * Module: matchEngine
 * Version: 1.0.0
 * Description: File content → axiom matching with confidence scoring.
 */

import { AXIOM_DOMAINS, AXIOM_INDEX, AXIOMS } from './data/axiomData.js';

/**
 * Match file text content AND extracted parameters against axiom repository.
 * @param {string} text - Raw extracted text from uploaded file
 * @param {Array} parameters - Raw parameters extracted by the OCG sensor
 * @param {string} mode - 'DEDUCTION' | 'INDUCTION' | 'ABDUCTION'
 * @returns {Array} matched axioms sorted by confidence desc
 */
export function matchTextToAxioms(text, parameters = [], mode = 'DEDUCTION') {
  if (!text && (!parameters || parameters.length === 0)) return [];

  const lowerText = text.toLowerCase();
  const domains = AXIOM_DOMAINS[mode] || AXIOM_DOMAINS.DEDUCTION;
  const results = [];

  // 1. Text-based keyword matching
  Object.values(domains).forEach(domain => {
    domain.axioms.forEach(axiom => {
      const score = _scoreAxiom(lowerText, axiom);
      if (score.confidence > 0.35) {
        results.push({ ...axiom, ...score });
      }
    });
  });

  // 2. Deterministic Parameter Matching (OCG Gateway)
  _evaluateBiometricParameters(parameters, results);

  return results.sort((a, b) => b.confidence - a.confidence);
}

function _evaluateBiometricParameters(parameters, results) {
  if (!parameters || parameters.length === 0) return;
  const paramMap = {};
  parameters.forEach(p => {
    // Normalize keys to find LDL, HDL, CHO
    const k = (p.param_id || '').toUpperCase();
    if (k.includes('LDL')) paramMap['LDL'] = parseFloat(p.value);
    if (k.includes('HDL')) paramMap['HDL'] = parseFloat(p.value);
    if (k.includes('CHO') || k.includes('CHOL')) paramMap['CHO'] = parseFloat(p.value);
    if (k.includes('EGFR')) paramMap['EGFR'] = parseFloat(p.value);
    if (k.includes('A1C')) paramMap['HBA1C'] = parseFloat(p.value);
  });

  // HLTH_LIPID_01: Atherogenic Index (T-CHO / HDL)
  if (paramMap['CHO'] && paramMap['HDL']) {
    const risk = paramMap['CHO'] / paramMap['HDL'];
    const anomaly = risk > 5.5;
    const ax = AXIOMS['HLTH_LIPID_01'];
    if (ax) results.push({ ...ax, confidence: 1.0, matchType: 'deterministic', matchedTerms: [`Risk_AS=${risk.toFixed(2)}`, anomaly ? 'CRITICAL_DRIFT' : 'NORMAL']});
  }

  // HLTH_LIPID_02: Ischemic Stroke Risk (LDL / HDL)
  if (paramMap['LDL'] && paramMap['HDL']) {
    const risk = paramMap['LDL'] / paramMap['HDL'];
    const anomaly = risk > 3.55;
    const ax = AXIOMS['HLTH_LIPID_02'];
    if (ax) results.push({ ...ax, confidence: 1.0, matchType: 'deterministic', matchedTerms: [`Risk_IS=${risk.toFixed(2)}`, anomaly ? 'CRITICAL_DRIFT' : 'NORMAL']});
  }

  // HLTH_LIPID_03: LDL Vascular Plaque
  if (paramMap['LDL'] > 130) {
    const ax = AXIOMS['HLTH_LIPID_03'];
    if (ax) results.push({ ...ax, confidence: 0.98, matchType: 'deterministic', matchedTerms: [`Accumulation Alert. LDL=${paramMap['LDL']}`]});
  }
}

/**
 * Score a single axiom against text.
 * @param {string} lowerText
 * @param {object} axiom
 * @returns {{ confidence: number, matchType: string, matchedTerms: string[] }}
 */
function _scoreAxiom(lowerText, axiom) {
  const matchedTerms = [];
  let confidence = 0;

  // Exact formula match (highest weight)
  const normFormula = axiom.formula.toLowerCase().replace(/\s+/g, '');
  const normText = lowerText.replace(/\s+/g, '');
  if (normText.includes(normFormula)) {
    confidence = Math.max(confidence, 0.97);
    matchedTerms.push(`exact_formula:${axiom.formula.slice(0, 20)}`);
  }

  // Axiom name exact match
  if (lowerText.includes(axiom.name.toLowerCase())) {
    confidence = Math.max(confidence, 0.88);
    matchedTerms.push(`exact_name:${axiom.name}`);
  }

  // Axiom ID match
  if (lowerText.includes(axiom.id.toLowerCase())) {
    confidence = Math.max(confidence, 0.85);
    matchedTerms.push(`id:${axiom.id}`);
  }

  // Key terms from name (each word ≥ 5 chars)
  const nameWords = axiom.name.toLowerCase().split(/\s+/).filter(w => w.length >= 5);
  const nameHits = nameWords.filter(w => lowerText.includes(w));
  if (nameHits.length > 0) {
    const partial = 0.55 + (nameHits.length / nameWords.length) * 0.25;
    confidence = Math.max(confidence, partial);
    matchedTerms.push(...nameHits.map(w => `term:${w}`));
  }

  // Key symbols in formula
  const formulaSymbols = _extractSymbols(axiom.formula);
  const symHits = formulaSymbols.filter(s => lowerText.includes(s.toLowerCase()));
  if (symHits.length >= 2) {
    const partial = 0.40 + (symHits.length / Math.max(formulaSymbols.length, 1)) * 0.25;
    confidence = Math.max(confidence, partial);
    matchedTerms.push(...symHits.map(s => `symbol:${s}`));
  }

  let matchType = 'none';
  if (confidence >= 0.90) matchType = 'exact';
  else if (confidence >= 0.70) matchType = 'keyword';
  else if (confidence >= 0.40) matchType = 'partial';

  return { confidence: Math.min(confidence, 1.0), matchType, matchedTerms };
}

function _extractSymbols(formula) {
  // Extract meaningful alpha-numeric tokens and Greek letters
  return formula.match(/[A-Za-z_α-ωΑ-Ω][A-Za-z0-9_]*/g) || [];
}

/**
 * Build GNN graph data from matched axioms.
 * @param {Array} matchedAxioms
 * @returns {{ nodes: Array, links: Array }}
 */
export function buildGNNGraph(matchedAxioms) {
  if (!matchedAxioms || matchedAxioms.length === 0) return { nodes: [], links: [] };

  const nodes = matchedAxioms.map((ax, i) => ({
    id: ax.id,
    name: ax.name,
    formula: ax.formula,
    confidence: ax.confidence,
    status: ax.status,
    group: ax.id.split('-')[0], // domain prefix
    x: null, y: null,
  }));

  // Build links between axioms sharing domain prefix
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].group === nodes[j].group) {
        links.push({ source: nodes[i].id, target: nodes[j].id, strength: 0.7 });
      } else if (Math.random() < 0.25) {
        links.push({ source: nodes[i].id, target: nodes[j].id, strength: 0.3 });
      }
    }
  }

  return { nodes, links };
}

/**
 * Build causal DAG data from matched axioms.
 * @param {Array} matchedAxioms
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildCausalGraph(matchedAxioms) {
  if (!matchedAxioms || matchedAxioms.length === 0) return { nodes: [], edges: [] };

  const nodes = [];
  const varSet = new Set();
  
  matchedAxioms.forEach((ax, idx) => {
      // Pick first letter of name as variable, or ID prefix
      const v = ax.name ? ax.name.charAt(0).toUpperCase() : ax.id.charAt(0);
      if (!varSet.has(v)) {
          varSet.add(v);
          nodes.push({
              id: String(v), label: String(v),
              x: 100 + (nodes.length % 4) * 180,
              y: 80 + Math.floor(nodes.length / 4) * 140,
              type: idx < 2 ? 'observable' : (idx === 2 ? 'latent' : 'intervention'),
              confidence: ax.confidence,
          });
      }
  });

  // Generate edges purely based on matched axioms and parameters
  const edges = [];
  
  // Create causal link between any Lipids and the Plaque accumulation
  const lipidNodes = nodes.filter(n => n.id.includes('HLTH_LIPID'));
  if (lipidNodes.length > 0) {
     nodes.push({id: 'Σ_Risk', label: 'Σ Risk', x: 280, y: 220, type:'latent', confidence: 1.0});
     lipidNodes.forEach(ln => {
        edges.push({ from: ln.id, to: 'Σ_Risk', strength: ln.confidence, label: ln.confidence.toFixed(2) });
     });
  }

  // Fallback random links if non-biology
  if (edges.length === 0 && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({ from: nodes[i].id, to: nodes[i+1].id, strength: 0.7, label: '0.7' });
    }
  }

  return { nodes, edges };
}

/**
 * Build world model particle state from matched axioms.
 * @param {Array} matchedAxioms
 * @param {number} count
 * @returns {Array} particle array
 */
export function buildWorldModelParticles(matchedAxioms, count = 1280) {
  const particles = [];
  const avgConf = matchedAxioms.length > 0
    ? matchedAxioms.reduce((s, a) => s + a.confidence, 0) / matchedAxioms.length
    : 0.5;

  // Use a pseudo-random seed based on the first axiom's ID so it's deterministic
  let seed = matchedAxioms.length > 0 ? (matchedAxioms[0].id.charCodeAt(0) * 12345) : 12345;
  const randomStr = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    particles.push({
      x: randomStr(),
      y: randomStr(),
      confidence: Math.max(0.1, avgConf + (randomStr() - 0.5) * 0.4),
      vx: (randomStr() - 0.5) * 0.002,
      vy: (randomStr() - 0.5) * 0.002,
    });
  }
  return particles;
}
