import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Model coefficients and parameters
const COEF = {
  intercept: 1.57859,
  age: -0.1078075,
  sex: 0.8647528,
  tiv: 0.0096637,
  sd_resid: 2.2252,
  ctrl_mean: 0.3985484,
  ctrl_sd: 0.0386747,
  scale_mean: 10,
  scale_sd: 3,
  threshold: -1
};

interface InputData {
  Ch4std: string;
  ageAtMRI: string;
  sex: string;
  TIV_entered: string;
  TIV_units: string;
  TIV_custom_multiplier: string;
}

interface ValidationErrors {
  Ch4std?: string;
  ageAtMRI?: string;
  sex?: string;
  TIV_entered?: string;
  TIV_custom_multiplier?: string;
}

// --- Section navigation items ---
const NAV_ITEMS = [
  { id: 'about', label: 'About' },
  { id: 'findings', label: 'Key Findings' },
  { id: 'tool', label: 'Subtyping Tool' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'publications', label: 'Publications' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'citation', label: 'Citation' },
];

const Index = () => {
  const { toast } = useToast();
  const [inputs, setInputs] = useState<InputData>({
    Ch4std: '', ageAtMRI: '', sex: '', TIV_entered: '', TIV_units: 'mL', TIV_custom_multiplier: '1'
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showDebug, setShowDebug] = useState(false);

  // --- Refs for scroll navigation ---
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    about: useRef<HTMLDivElement>(null),
    findings: useRef<HTMLDivElement>(null),
    tool: useRef<HTMLDivElement>(null),
    methodology: useRef<HTMLDivElement>(null),
    publications: useRef<HTMLDivElement>(null),
    presentations: useRef<HTMLDivElement>(null),
    citation: useRef<HTMLDivElement>(null),
  };

  const scrollToSection = (id: string) => {
    sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // --- Calculator logic (unchanged) ---
  const validateField = useCallback((key: keyof InputData, value: string): string | undefined => {
    if (key === 'sex' || key === 'TIV_units') return !value.trim() ? 'This field is required' : undefined;
    if (!value.trim()) return 'This field is required';
    const n = Number(value);
    if (isNaN(n)) return 'Must be a valid number';
    if (key === 'ageAtMRI' && (n < 0 || n > 120)) return 'Age must be between 0 and 120 years';
    if ((key === 'Ch4std' || key === 'TIV_entered') && n < 0) return 'Value must be positive';
    if (key === 'TIV_custom_multiplier' && n <= 0) return 'Multiplier must be positive';
    return undefined;
  }, []);

  const handleInputChange = useCallback((key: keyof InputData, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
    const err = validateField(key, value);
    if (err) setErrors(prev => ({ ...prev, [key]: err }));
  }, [validateField]);

  const handleSliderChange = useCallback((key: keyof InputData, value: number[]) => {
    handleInputChange(key, value[0].toString());
  }, [handleInputChange]);

  const getSliderRange = (key: keyof InputData) => {
    if (key === 'Ch4std') return { min: 0, max: 1, step: 0.001 };
    if (key === 'ageAtMRI') return { min: 0, max: 120, step: 1 };
    if (key === 'TIV_entered') {
      if (inputs.TIV_units === 'mm\u00B3') return { min: 0, max: 2000000, step: 1000 };
      return { min: 0, max: 2000, step: 1 };
    }
    return { min: 0, max: 100, step: 1 };
  };

  const getTIVScaleToML = useCallback(() => {
    switch (inputs.TIV_units) {
      case 'mL': return 1; case 'mm\u00B3': return 0.001; case 'L': return 1000;
      case 'custom': return Number(inputs.TIV_custom_multiplier) || 1; default: return 1;
    }
  }, [inputs.TIV_units, inputs.TIV_custom_multiplier]);

  const isValid = useMemo(() => {
    const req = ['Ch4std', 'ageAtMRI', 'sex', 'TIV_entered'];
    const ok = req.every(f => inputs[f as keyof InputData].trim() !== '') && Object.keys(errors).length === 0;
    if (inputs.TIV_units === 'custom') { const m = Number(inputs.TIV_custom_multiplier); if (isNaN(m) || m <= 0) return false; }
    return ok;
  }, [inputs, errors]);

  const computedResults = useMemo(() => {
    if (!isValid) return null;
    const Ch4std = Number(inputs.Ch4std), ageAtMRI = Number(inputs.ageAtMRI);
    const TIV_effective_mL = Number(inputs.TIV_entered) * getTIVScaleToML();
    const participantCh4GMD = (((Ch4std - COEF.ctrl_mean) / COEF.ctrl_sd) * COEF.scale_sd) + COEF.scale_mean;
    const sex01 = inputs.sex === 'Male' ? 1 : 0;
    const intercept_term = COEF.intercept, age_term = COEF.age * ageAtMRI;
    const sex_term = COEF.sex * sex01, tiv_term = COEF.tiv * TIV_effective_mL;
    const predicted = intercept_term + age_term + sex_term + tiv_term;
    const z = (participantCh4GMD - predicted) / COEF.sd_resid;
    return { participantCh4GMD, predicted, z, classification: z < COEF.threshold ? 'Low Ch4 GMD' : 'Normal Ch4 GMD', TIV_effective_mL, TIV_scale_to_mL: getTIVScaleToML(), sex01, debug: { intercept_term, age_term, sex_term, tiv_term } };
  }, [inputs, isValid, getTIVScaleToML]);

  const handleReset = useCallback(() => { setInputs({ Ch4std: '', ageAtMRI: '', sex: '', TIV_entered: '', TIV_units: 'mL', TIV_custom_multiplier: '1' }); setErrors({}); }, []);

  const handleCopyJSON = useCallback(async () => {
    if (!computedResults) return;
    const out = { input: { Ch4std: Number(inputs.Ch4std), ageAtMRI: Number(inputs.ageAtMRI), sex: inputs.sex, TIV_entered: Number(inputs.TIV_entered), TIV_units: inputs.TIV_units, TIV_scale_to_mL: computedResults.TIV_scale_to_mL, TIV_effective_mL: computedResults.TIV_effective_mL }, computed: { participantCh4GMD: computedResults.participantCh4GMD, predicted: computedResults.predicted, z: computedResults.z, classification: computedResults.classification } };
    try { await navigator.clipboard.writeText(JSON.stringify(out, null, 2)); toast({ title: "JSON Copied", description: "Results copied to clipboard" }); } catch { toast({ title: "Copy Failed", description: "Unable to copy", variant: "destructive" }); }
  }, [inputs, computedResults, toast]);

  // --- Helper: pill link ---
  const PillLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-full transition-colors">{children}</a>
  );

  // ===================== RENDER =====================
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 brain-bg pointer-events-none" />
      <div className="relative z-10">

        {/* ===== SITE NAV ===== */}
        <nav className="bg-[#162e51] text-white">
          <div className="max-w-5xl mx-auto px-6 h-[52px] flex items-center gap-5">
            <a href="https://negidamd.github.io/" className="font-extrabold text-base no-underline text-white">Ahmed <span className="text-[#73b3e7]">Negida</span></a>
            <div className="ml-auto flex gap-5 text-sm font-semibold">
              <a href="https://negidamd.github.io/pd-subtyping.html" className="text-white/90 hover:text-white no-underline">&larr; PD Subtyping</a>
              <a href="https://negidamd.github.io/" className="text-white/90 hover:text-white no-underline">Main site</a>
            </div>
          </div>
        </nav>

        {/* ===== HERO ===== */}
        <div className="px-6 pt-10 pb-8">
          <div className="max-w-5xl mx-auto text-center space-y-5 animate-fade-in">
            <img src={`${import.meta.env.BASE_URL}lovable-uploads/c42099f0-ebe0-4830-b8bf-202f00856c9b.png`} alt="Ch4 Brain Region" className="w-20 h-20 mx-auto object-contain animate-pulse-glow" />
            <h1 className="text-4xl lg:text-5xl font-bold medical-heading">
              Cholinergic Subtyping of PD-MCI
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              A novel MRI-based framework for subtyping Parkinson's disease with mild cognitive impairment by cholinergic nucleus 4 (Ch4) degeneration
            </p>
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="font-medium">Ahmed Negida, MD, PhD</span>
              <span className="text-primary">|</span>
              <span>VCU Parkinson &amp; Movement Disorder Center</span>
            </div>
            {/* Nav pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {NAV_ITEMS.map(item => (
                <button key={item.id} onClick={() => scrollToSection(item.id)} className="px-4 py-2 text-xs font-semibold rounded-full border border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-12">
          <div className="max-w-5xl mx-auto space-y-12">

            {/* ===== ABOUT ===== */}
            <div ref={sectionRefs.about as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">About This Work</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                  <p>
                    Parkinson's disease with mild cognitive impairment (PD-MCI) is clinically heterogeneous, yet current classification schemes are predominantly motor-based and do not capture the cholinergic dimension of disease heterogeneity. The <strong>nucleus basalis of Meynert (NBM/Ch4)</strong> is the major source of cortical acetylcholine and is selectively vulnerable to alpha-synuclein pathology in PD.
                  </p>
                  <p>
                    We developed a <strong>normative regression-based subtyping framework</strong> that classifies PD-MCI patients as having <strong>Low Ch4 GMD</strong> (disproportionate cholinergic degeneration) or <strong>Normal Ch4 GMD</strong> based on structural MRI, after adjusting for the effects of age, sex, and total intracranial volume. This framework was derived using data from the <strong>Parkinson's Progression Markers Initiative (PPMI)</strong>.
                  </p>
                  <p>
                    The work was first presented as a <strong>poster at the International Congress of Parkinson's Disease and Movement Disorders (MDS 2024)</strong>, then selected for an <strong>oral platform presentation at the American Academy of Neurology Annual Meeting (AAN 2025)</strong>, covered by <strong>Neurology Today</strong>, and published as a full article in <strong><em>Parkinsonism &amp; Related Disorders</em></strong>.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ===== KEY FINDINGS ===== */}
            <div ref={sectionRefs.findings as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">Key Findings</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { title: 'Distinct Clinical Profile', desc: 'PD-MCI patients with Low Ch4 GMD have significantly worse MDS-UPDRS total and subscale scores, greater autonomic dysfunction, and reduced olfaction (all P < 0.05).', color: 'bg-blue-500/10 border-blue-500/20' },
                      { title: 'Faster Cognitive Decline', desc: 'The Low Ch4 GMD subgroup progresses significantly faster to cognitive milestones on Kaplan\u2013Meier survival analysis (log-rank P = 0.0017).', color: 'bg-red-500/10 border-red-500/20' },
                      { title: 'Overlap with Diffuse Malignant PD', desc: '51.6% of Low Ch4 GMD patients were classified as diffuse malignant PD, compared with 23.4% of the Normal Ch4 GMD group (P < 0.01).', color: 'bg-amber-500/10 border-amber-500/20' },
                      { title: 'Outperforms Existing Subtypes', desc: 'Ch4 subtyping provided greater prognostic accuracy for cognitive progression than tremor-dominant/PIGD, brain-first/body-first, and diffuse-malignant classifications.', color: 'bg-green-500/10 border-green-500/20' },
                    ].map(f => (
                      <div key={f.title} className={`p-5 rounded-xl border ${f.color}`}>
                        <h4 className="font-semibold text-foreground mb-2">{f.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== SUBTYPING TOOL ===== */}
            <div ref={sectionRefs.tool as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-foreground">Ch4 Subtyping Calculator</h2>
                <p className="text-sm text-muted-foreground mt-1">Enter patient data below to compute the Ch4 GMD z-score and classification</p>
              </div>
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Inputs Card */}
                <Card className="medical-card border-0">
                  <CardHeader className="pb-4"><CardTitle className="text-xl">Patient Inputs</CardTitle></CardHeader>
                  <CardContent className="space-y-5">
                    {/* Ch4 GMD */}
                    <div className="space-y-3">
                      <Label htmlFor="Ch4std" className="text-sm font-medium">Standardized Ch4 GMD</Label>
                      <Input id="Ch4std" type="number" step="any" value={inputs.Ch4std} onChange={e => handleInputChange('Ch4std', e.target.value)} className={`h-11 ${errors.Ch4std ? 'border-destructive' : ''}`} placeholder="0.400" />
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2"><span>0.000</span><span className="text-primary font-semibold">{inputs.Ch4std || '0.000'}</span><span>1.000</span></div>
                        <Slider value={[Number(inputs.Ch4std) || 0]} onValueChange={v => handleSliderChange('Ch4std', v)} min={0} max={1} step={0.001} />
                      </div>
                      {errors.Ch4std && <p className="text-xs text-destructive font-medium">{errors.Ch4std}</p>}
                    </div>
                    {/* Age */}
                    <div className="space-y-3">
                      <Label htmlFor="ageAtMRI" className="text-sm font-medium">Age at MRI (years)</Label>
                      <Input id="ageAtMRI" type="number" step="any" value={inputs.ageAtMRI} onChange={e => handleInputChange('ageAtMRI', e.target.value)} className={`h-11 ${errors.ageAtMRI ? 'border-destructive' : ''}`} placeholder="65" />
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2"><span>0</span><span className="text-primary font-semibold">{inputs.ageAtMRI || '0'} yrs</span><span>120</span></div>
                        <Slider value={[Number(inputs.ageAtMRI) || 0]} onValueChange={v => handleSliderChange('ageAtMRI', v)} min={0} max={120} step={1} />
                      </div>
                      {errors.ageAtMRI && <p className="text-xs text-destructive font-medium">{errors.ageAtMRI}</p>}
                    </div>
                    {/* Sex */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Sex</Label>
                      <Select value={inputs.sex} onValueChange={v => handleInputChange('sex', v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select sex" /></SelectTrigger>
                        <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                      </Select>
                      {errors.sex && <p className="text-xs text-destructive font-medium">{errors.sex}</p>}
                    </div>
                    {/* TIV */}
                    <div className="space-y-3">
                      <Label htmlFor="TIV_entered" className="text-sm font-medium">Total Intracranial Volume (TIV)</Label>
                      <div className="flex gap-2">
                        <Input id="TIV_entered" type="number" step="any" value={inputs.TIV_entered} onChange={e => handleInputChange('TIV_entered', e.target.value)} className={`h-11 flex-1 ${errors.TIV_entered ? 'border-destructive' : ''}`} placeholder="1500" />
                        <Select value={inputs.TIV_units} onValueChange={v => handleInputChange('TIV_units', v)}>
                          <SelectTrigger className="w-24 h-11"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="mL">mL</SelectItem><SelectItem value="mm³">mm³</SelectItem><SelectItem value="L">L</SelectItem><SelectItem value="custom">custom</SelectItem></SelectContent>
                        </Select>
                      </div>
                      {inputs.TIV_units === 'custom' && (
                        <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg space-y-2">
                          <Label htmlFor="TIV_custom_multiplier" className="text-xs">Custom multiplier to mL</Label>
                          <Input id="TIV_custom_multiplier" type="number" step="any" value={inputs.TIV_custom_multiplier} onChange={e => handleInputChange('TIV_custom_multiplier', e.target.value)} className="h-9" placeholder="1" />
                        </div>
                      )}
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2"><span>0</span><span className="text-primary font-semibold">{inputs.TIV_entered ? `${Number(inputs.TIV_entered).toLocaleString()} ${inputs.TIV_units}` : `0 ${inputs.TIV_units}`}</span><span>{getSliderRange('TIV_entered').max.toLocaleString()}</span></div>
                        <Slider value={[Number(inputs.TIV_entered) || 0]} onValueChange={v => handleSliderChange('TIV_entered', v)} {...getSliderRange('TIV_entered')} />
                      </div>
                      {errors.TIV_entered && <p className="text-xs text-destructive font-medium">{errors.TIV_entered}</p>}
                    </div>
                    <Button onClick={handleReset} variant="outline" className="w-full h-10 text-sm hover:bg-destructive/10 hover:text-destructive transition-colors">Reset All Fields</Button>
                  </CardContent>
                </Card>

                {/* Results Card */}
                <Card className="medical-card border-0">
                  <CardHeader className="pb-4"><CardTitle className="text-xl">Results</CardTitle></CardHeader>
                  <CardContent className="space-y-5">
                    {computedResults ? (
                      <div className="space-y-5 animate-fade-in">
                        <div className="grid gap-3">
                          {[
                            { label: 'Participant Ch4 GMD (scaled)', value: computedResults.participantCh4GMD.toFixed(4) },
                            { label: 'Predicted Value', value: computedResults.predicted.toFixed(4) },
                            { label: 'Z-score', value: computedResults.z.toFixed(4) },
                          ].map(r => (
                            <div key={r.label} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                              <span className="text-sm font-medium">{r.label}</span>
                              <span className="font-mono text-primary font-semibold">{r.value}</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center p-5 bg-gradient-to-r from-muted/30 to-muted/50 rounded-xl border">
                            <span className="text-base font-semibold">Classification</span>
                            <div className={`px-5 py-2.5 rounded-full font-bold text-sm ${computedResults.classification === 'Normal Ch4 GMD' ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                              {computedResults.classification}
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-muted/20 rounded-lg text-sm text-muted-foreground leading-relaxed">
                          <p className="font-semibold text-foreground mb-1.5">Interpretation</p>
                          {computedResults.classification === 'Low Ch4 GMD' ? (
                            <p>This patient's Ch4 GMD falls &gt;1 SD below the normative prediction (z = {computedResults.z.toFixed(2)}), suggesting disproportionate cholinergic degeneration. This profile has been associated with more aggressive cognitive decline and may identify patients who preferentially benefit from cholinergic-targeted interventions.</p>
                          ) : (
                            <p>This patient's Ch4 GMD is within the expected range (z = {computedResults.z.toFixed(2)}). Ch4 cholinergic degeneration is not disproportionately advanced for their demographic profile. Cognitive impairment may be driven by non-cholinergic mechanisms.</p>
                          )}
                        </div>
                        <Collapsible open={showDebug} onOpenChange={setShowDebug}>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between p-3 h-auto bg-muted/20 hover:bg-muted/40 text-sm">
                              <span>Debug Panel</span>{showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3 border-t">
                            <div className="grid gap-1.5 text-xs bg-muted/20 p-3 rounded-lg font-mono">
                              {[['Intercept', computedResults.debug.intercept_term], ['Age term', computedResults.debug.age_term], ['Sex term', computedResults.debug.sex_term], ['TIV term', computedResults.debug.tiv_term], ['Effective TIV (mL)', computedResults.TIV_effective_mL], ['Sex (0/1)', computedResults.sex01]].map(([l, v]) => (
                                <div key={String(l)} className="flex justify-between border-b border-border/20 pb-1"><span>{String(l)}</span><span className="text-primary font-semibold">{typeof v === 'number' ? v.toFixed(4) : v}</span></div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                        <Button onClick={handleCopyJSON} className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary-glow transition-all medical-glow">Copy JSON Results</Button>
                      </div>
                    ) : (
                      <div className="text-center py-16 space-y-3">
                        <div className="w-16 h-16 mx-auto bg-muted/30 rounded-full flex items-center justify-center"><span className="text-2xl opacity-40">🔬</span></div>
                        <p className="text-sm text-muted-foreground">Complete all fields to see results</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="mt-4 p-4 bg-warning/20 border border-warning/30 rounded-xl text-center">
                <p className="text-sm text-black font-medium italic">Research decision-support only; not standalone for clinical care.</p>
              </div>
            </div>

            {/* ===== METHODOLOGY ===== */}
            <div ref={sectionRefs.methodology as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">Methodology</CardTitle></CardHeader>
                <CardContent className="space-y-6 text-sm text-muted-foreground leading-relaxed">
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="p-5 bg-muted/20 rounded-xl space-y-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                      <h4 className="font-semibold text-foreground">Scaling</h4>
                      <p>Ch4 GMD (from T1-MRI via Zaborszky et al. cytoarchitectonic maps) is scaled using healthy control reference values (mean = 0.399, SD = 0.039):</p>
                      <div className="bg-background/60 p-2.5 rounded font-mono text-xs">Scaled = ((Ch4 - 0.399) / 0.039) &times; 3 + 10</div>
                    </div>
                    <div className="p-5 bg-muted/20 rounded-xl space-y-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                      <h4 className="font-semibold text-foreground">Normative Prediction</h4>
                      <p>A predicted Ch4 GMD is computed from a regression model adjusting for age, sex (M=1, F=0), and TIV:</p>
                      <div className="bg-background/60 p-2.5 rounded font-mono text-xs">Pred = 1.579 + (-0.108 &times; Age) + (0.865 &times; Sex) + (0.010 &times; TIV)</div>
                    </div>
                    <div className="p-5 bg-muted/20 rounded-xl space-y-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
                      <h4 className="font-semibold text-foreground">Z-score &amp; Classification</h4>
                      <p>Deviation expressed as z-score (SD<sub>res</sub> = 2.225). Patients with z &lt; &minus;1.0 are classified <strong>Low Ch4 GMD</strong>:</p>
                      <div className="bg-background/60 p-2.5 rounded font-mono text-xs">Z = (Scaled - Predicted) / 2.225</div>
                    </div>
                  </div>
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
                    <h4 className="font-semibold text-foreground mb-1">Ch4 GMD Extraction</h4>
                    <p>Ch4 GMD should be extracted from T1-weighted MRI using the stereotactic cytoarchitectonic maps of Zaborszky et al. (2008) via VBM pipelines (e.g., CAT12/SPM). The input is the mean gray matter density within the Ch4 (NBM) region of interest.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== PUBLICATIONS ===== */}
            <div ref={sectionRefs.publications as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">Publications</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {/* Full article */}
                  <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">Full Article</span>
                      <span className="text-xs text-muted-foreground">2025</span>
                    </div>
                    <h4 className="font-semibold text-foreground leading-snug">
                      Parkinson's disease mild cognitive impairment with MRI evidence of cholinergic nucleus 4 degeneration: A new subtype?
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Negida A, Vohra HZ, Lageman SK, Mukhopadhyay N, Berman BD, Weintraub D, Barrett MJ.
                    </p>
                    <p className="text-sm text-muted-foreground italic">Parkinsonism &amp; Related Disorders. 2025;141:108072.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <PillLink href="https://doi.org/10.1016/j.parkreldis.2025.108072">DOI</PillLink>
                      <PillLink href="https://pubmed.ncbi.nlm.nih.gov/41106089/">PubMed</PillLink>
                      <PillLink href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12949478/">PMC Full Text</PillLink>
                    </div>
                  </div>

                  {/* AAN abstract */}
                  <div className="p-5 rounded-xl border border-border/50 bg-muted/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-bold rounded">Abstract</span>
                      <span className="text-xs text-muted-foreground">AAN 2025</span>
                    </div>
                    <h4 className="font-semibold text-foreground leading-snug">
                      Parkinson's Disease Mild Cognitive Impairment with MRI evidence of Cholinergic Nucleus 4 Degeneration: A New Subtype?
                    </h4>
                    <p className="text-sm text-muted-foreground italic">Neurology. 2025;104(7 Supplement 1). Oral Presentation S32.005.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <PillLink href="https://www.neurology.org/doi/10.1212/WNL.0000000000212426">Neurology Abstract</PillLink>
                    </div>
                  </div>

                  {/* MDS abstract */}
                  <div className="p-5 rounded-xl border border-border/50 bg-muted/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-bold rounded">Abstract</span>
                      <span className="text-xs text-muted-foreground">MDS 2024</span>
                    </div>
                    <h4 className="font-semibold text-foreground leading-snug">
                      Subtyping Parkinson's Disease Mild Cognitive Impairment (PD-MCI) by Cholinergic Degeneration
                    </h4>
                    <p className="text-sm text-muted-foreground italic">International Congress of Parkinson's Disease and Movement Disorders 2024. Poster Presentation.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <PillLink href="https://www.mdsabstracts.org/abstract/subtyping-parkinsons-disease-mild-cognitive-impairment-pd-mci-by-cholinergic-degeneration/">MDS Abstract</PillLink>
                    </div>
                  </div>

                  {/* Media */}
                  <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-700 text-xs font-bold rounded">Media Coverage</span>
                    </div>
                    <h4 className="font-semibold text-foreground leading-snug">Neurology Today (American Academy of Neurology)</h4>
                    <p className="text-sm text-muted-foreground">Coverage of AAN 2025 oral presentation findings.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <PillLink href="https://neurologytoday.aan.com/doi/10.1212/breakingnews.1581">Read Article</PillLink>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== PRESENTATIONS (Photos) ===== */}
            <div ref={sectionRefs.presentations as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">Conference Presentations</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* MDS 2024 */}
                    <div className="space-y-3">
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/30 border">
                        <img src={`${import.meta.env.BASE_URL}images/mds-2024-poster.jpg`} alt="MDS 2024 Poster Presentation - Subtyping PD-MCI by Cholinergic Degeneration" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center">MDS 2024 Poster Photo<br/><span class="text-xs opacity-60 mt-1 block">Add image to /public/images/mds-2024-poster.jpg</span></div>'; }} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">MDS International Congress 2024</h4>
                        <p className="text-sm text-muted-foreground">Poster Presentation &mdash; Philadelphia, PA</p>
                      </div>
                    </div>
                    {/* AAN 2025 */}
                    <div className="space-y-3">
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-muted/30 border">
                        <img src={`${import.meta.env.BASE_URL}images/aan-2025-oral.jpg`} alt="AAN 2025 Oral Platform Presentation - Ch4 Subtyping in PD-MCI" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center">AAN 2025 Oral Presentation Photo<br/><span class="text-xs opacity-60 mt-1 block">Add image to /public/images/aan-2025-oral.jpg</span></div>'; }} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">AAN Annual Meeting 2025</h4>
                        <p className="text-sm text-muted-foreground">Oral Platform Presentation (S32.005) &mdash; San Diego, CA</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== CITATION ===== */}
            <div ref={sectionRefs.citation as React.RefObject<HTMLDivElement>} className="scroll-mt-8">
              <Card className="medical-card border-0">
                <CardHeader><CardTitle className="text-2xl">Citation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">If you use this tool or framework in your research, please cite:</p>
                  <div className="p-4 bg-muted/30 rounded-lg text-sm text-muted-foreground leading-relaxed">
                    Negida A, Vohra HZ, Lageman SK, Mukhopadhyay N, Berman BD, Weintraub D, Barrett MJ. Parkinson's disease mild cognitive impairment with MRI evidence of cholinergic nucleus 4 degeneration: A new subtype? <em>Parkinsonism Relat Disord.</em> 2025;141:108072. doi: 10.1016/j.parkreldis.2025.108072
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <PillLink href="https://doi.org/10.1016/j.parkreldis.2025.108072">Full Text (DOI)</PillLink>
                    <PillLink href="https://pubmed.ncbi.nlm.nih.gov/41106089/">PubMed</PillLink>
                    <PillLink href="https://github.com/Negidamd/ch4-subtyper">GitHub</PillLink>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ===== AUTHOR ===== */}
            <div className="p-8 medical-card rounded-xl text-center space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Corresponding Author</p>
              <h3 className="text-2xl font-bold medical-heading">Ahmed Negida, MD, PhD</h3>
              <div className="space-y-1 text-muted-foreground">
                <p className="font-medium">Parkinson and Movement Disorder Center</p>
                <p>Department of Neurology, Virginia Commonwealth University</p>
                <p>Richmond, VA</p>
              </div>
              <p className="text-sm text-muted-foreground font-mono pt-2">ahmed@negida.com</p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <PillLink href="https://github.com/Negidamd/ch4-subtyper">GitHub</PillLink>
                <PillLink href="https://pubmed.ncbi.nlm.nih.gov/?term=negida+a&sort=date">PubMed Profile</PillLink>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
