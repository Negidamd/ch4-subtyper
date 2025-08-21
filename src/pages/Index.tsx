import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Model coefficients and parameters for easy editing
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

const Index = () => {
  console.log('PD-MCI Ch4 Subtyping Tool component is mounting');
  const { toast } = useToast();
  
  const [inputs, setInputs] = useState<InputData>({
    Ch4std: '',
    ageAtMRI: '',
    sex: '',
    TIV_entered: '',
    TIV_units: 'mL',
    TIV_custom_multiplier: '1'
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showDebug, setShowDebug] = useState(false);

  const validateField = useCallback((key: keyof InputData, value: string): string | undefined => {
    if (key === 'sex' || key === 'TIV_units') {
      if (!value.trim()) {
        return 'This field is required';
      }
      return;
    }
    
    if (!value.trim()) {
      return 'This field is required';
    }
    
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return 'Must be a valid number';
    }
    
    if (key === 'ageAtMRI' && (numValue < 0 || numValue > 120)) {
      return 'Age must be between 0 and 120 years';
    }
    
    if ((key === 'Ch4std' || key === 'TIV_entered') && numValue < 0) {
      return 'Value must be positive';
    }
    
    if (key === 'TIV_custom_multiplier' && numValue <= 0) {
      return 'Multiplier must be positive';
    }
    
    return;
  }, []);

  const handleInputChange = useCallback((key: keyof InputData, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
    
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
    
    // Validate field
    const error = validateField(key, value);
    if (error) {
      setErrors(prev => ({ ...prev, [key]: error }));
    }
  }, [validateField]);

  const handleSliderChange = useCallback((key: keyof InputData, value: number[]) => {
    handleInputChange(key, value[0].toString());
  }, [handleInputChange]);

  const getSliderRange = (key: keyof InputData) => {
    switch (key) {
      case 'Ch4std':
        return { min: 0, max: 1, step: 0.001 };
      case 'ageAtMRI':
        return { min: 0, max: 120, step: 1 };
      case 'sex':
        return { min: 0, max: 1, step: 0.01 };
      case 'TIV_entered':
        return inputs.TIV_units === 'mm³' 
          ? { min: 0, max: 2000000, step: 1000 }
          : inputs.TIV_units === 'L'
          ? { min: 0, max: 2000, step: 1 }
          : { min: 0, max: 2000, step: 1 }; // mL or custom
      default:
        return { min: 0, max: 100, step: 1 };
    }
  };

  const getTIVScaleToML = useCallback(() => {
    switch (inputs.TIV_units) {
      case 'mL': return 1;
      case 'mm³': return 0.001;
      case 'L': return 1000;
      case 'custom': return Number(inputs.TIV_custom_multiplier) || 1;
      default: return 1;
    }
  }, [inputs.TIV_units, inputs.TIV_custom_multiplier]);

  const isValid = useMemo(() => {
    const requiredFields = ['Ch4std', 'ageAtMRI', 'sex', 'TIV_entered'];
    const hasAllFields = requiredFields.every(field => inputs[field as keyof InputData].trim() !== '');
    const hasNoErrors = Object.keys(errors).length === 0;
    const noNaNValues = requiredFields.every(field => {
      const value = inputs[field as keyof InputData];
      if (field === 'sex') return value !== '';
      return !isNaN(Number(value));
    });
    
    // Also validate custom multiplier if using custom units
    if (inputs.TIV_units === 'custom') {
      const customMultiplier = Number(inputs.TIV_custom_multiplier);
      if (isNaN(customMultiplier) || customMultiplier <= 0) return false;
    }
    
    return hasAllFields && hasNoErrors && noNaNValues;
  }, [inputs, errors]);

  const computedResults = useMemo(() => {
    if (!isValid) return null;
    
    const Ch4std = Number(inputs.Ch4std);
    const ageAtMRI = Number(inputs.ageAtMRI);
    const TIV_entered = Number(inputs.TIV_entered);
    const TIV_scale_to_mL = getTIVScaleToML();
    const TIV_effective_mL = TIV_entered * TIV_scale_to_mL;
    
    // Compute scaled participant Ch4 GMD
    const participantCh4GMD = (((Ch4std - COEF.ctrl_mean) / COEF.ctrl_sd) * COEF.scale_sd) + COEF.scale_mean;
    
    // Map sex to 0/1 (Female=0, Male=1)
    const sex01 = inputs.sex === 'Male' ? 1 : 0;
    
    // Compute predicted value using regression
    const intercept_term = COEF.intercept;
    const age_term = COEF.age * ageAtMRI;
    const sex_term = COEF.sex * sex01;
    const tiv_term = COEF.tiv * TIV_effective_mL;
    const predicted = intercept_term + age_term + sex_term + tiv_term;
    
    // Compute z-score
    const z = (participantCh4GMD - predicted) / COEF.sd_resid;
    
    const classification = z < COEF.threshold ? 'Low Ch4 GMD' : 'Normal Ch4 GMD';
    
    return {
      participantCh4GMD,
      predicted,
      z,
      classification,
      TIV_effective_mL,
      TIV_scale_to_mL,
      sex01,
      debug: {
        intercept_term,
        age_term,
        sex_term,
        tiv_term
      }
    };
  }, [inputs, isValid, getTIVScaleToML]);

  const handleReset = useCallback(() => {
    setInputs({
      Ch4std: '',
      ageAtMRI: '',
      sex: '',
      TIV_entered: '',
      TIV_units: 'mL',
      TIV_custom_multiplier: '1'
    });
    setErrors({});
  }, []);

  const handleCopyJSON = useCallback(async () => {
    if (!computedResults) return;
    
    const jsonOutput = {
      input: {
        Ch4std: Number(inputs.Ch4std),
        ageAtMRI: Number(inputs.ageAtMRI),
        sex: inputs.sex,
        TIV_entered: Number(inputs.TIV_entered),
        TIV_units: inputs.TIV_units,
        TIV_scale_to_mL: computedResults.TIV_scale_to_mL,
        TIV_effective_mL: computedResults.TIV_effective_mL
      },
      computed: {
        participantCh4GMD: computedResults.participantCh4GMD,
        predicted: computedResults.predicted,
        z: computedResults.z,
        classification: computedResults.classification
      }
    };
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonOutput, null, 2));
      toast({
        title: "JSON Copied",
        description: "Results have been copied to clipboard"
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy to clipboard",
        variant: "destructive"
      });
    }
  }, [inputs, computedResults, toast]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Brain Background */}
      <div className="absolute inset-0 brain-bg pointer-events-none" />
      
      <div className="relative z-10 p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4 animate-fade-in">
            <div className="flex items-center justify-center gap-4 mb-4">
              <img 
                src="/lovable-uploads/c42099f0-ebe0-4830-b8bf-202f00856c9b.png" 
                alt="Ch4 Brain Region" 
                className="w-16 h-16 object-contain animate-pulse-glow"
              />
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold medical-heading">
              PD-MCI Ch4 Subtyping Tool
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real-time subtyping of PD-MCI patients by Ch4 GMD
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span>Advanced Neuroimaging Analysis</span>
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Inputs Card */}
            <Card className="medical-card border-0 animate-slide-up">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold">📊</span>
                  </div>
                  Patient Inputs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label htmlFor="Ch4std" className="text-base font-medium">Standardized Ch4 GMD</Label>
                  <div className="space-y-4">
                    <Input
                      id="Ch4std"
                      type="number"
                      step="any"
                      value={inputs.Ch4std}
                      onChange={(e) => handleInputChange('Ch4std', e.target.value)}
                      className={`h-12 text-lg ${errors.Ch4std ? 'border-destructive focus:ring-destructive' : 'focus:ring-primary'} transition-all duration-200`}
                      aria-describedby="Ch4std-error"
                      placeholder="0.400"
                    />
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                      <div className="flex justify-between text-sm text-muted-foreground font-mono">
                        <span>0.000</span>
                        <span className="font-semibold text-primary">{inputs.Ch4std || '0.000'}</span>
                        <span>1.000</span>
                      </div>
                      <Slider
                        value={[Number(inputs.Ch4std) || 0]}
                        onValueChange={(value) => handleSliderChange('Ch4std', value)}
                        min={0}
                        max={1}
                        step={0.001}
                        className="w-full"
                      />
                    </div>
                  </div>
                  {errors.Ch4std && (
                    <p id="Ch4std-error" className="text-sm text-destructive font-medium animate-fade-in" role="alert">
                      {errors.Ch4std}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <Label htmlFor="ageAtMRI" className="text-base font-medium">Age at MRI (years)</Label>
                  <div className="space-y-4">
                    <Input
                      id="ageAtMRI"
                      type="number"
                      step="any"
                      value={inputs.ageAtMRI}
                      onChange={(e) => handleInputChange('ageAtMRI', e.target.value)}
                      className={`h-12 text-lg ${errors.ageAtMRI ? 'border-destructive focus:ring-destructive' : 'focus:ring-primary'} transition-all duration-200`}
                      aria-describedby="ageAtMRI-help ageAtMRI-error"
                      placeholder="65"
                    />
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                      <div className="flex justify-between text-sm text-muted-foreground font-mono">
                        <span>0</span>
                        <span className="font-semibold text-primary">{inputs.ageAtMRI || '0'} years</span>
                        <span>120</span>
                      </div>
                      <Slider
                        value={[Number(inputs.ageAtMRI) || 0]}
                        onValueChange={(value) => handleSliderChange('ageAtMRI', value)}
                        min={0}
                        max={120}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <p id="ageAtMRI-help" className="text-sm text-muted-foreground">
                    Age in years at time of MRI scan
                  </p>
                  {errors.ageAtMRI && (
                    <p id="ageAtMRI-error" className="text-sm text-destructive font-medium animate-fade-in" role="alert">
                      {errors.ageAtMRI}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label htmlFor="sex" className="text-base font-medium">Sex</Label>
                  <Select value={inputs.sex} onValueChange={(value) => handleInputChange('sex', value)}>
                    <SelectTrigger className={`h-12 ${errors.sex ? 'border-destructive' : ''}`} aria-describedby="sex-error">
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.sex && (
                    <p id="sex-error" className="text-sm text-destructive font-medium animate-fade-in" role="alert">
                      {errors.sex}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <Label htmlFor="TIV_entered" className="text-base font-medium">Total Intracranial Volume (TIV)</Label>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Input
                        id="TIV_entered"
                        type="number"
                        step="any"
                        value={inputs.TIV_entered}
                        onChange={(e) => handleInputChange('TIV_entered', e.target.value)}
                        className={`h-12 text-lg flex-1 ${errors.TIV_entered ? 'border-destructive focus:ring-destructive' : 'focus:ring-primary'} transition-all duration-200`}
                        aria-describedby="TIV_entered-help TIV_entered-error"
                        placeholder="1500"
                      />
                      <Select value={inputs.TIV_units} onValueChange={(value) => handleInputChange('TIV_units', value)}>
                        <SelectTrigger className="w-28 h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mL">mL</SelectItem>
                          <SelectItem value="mm³">mm³</SelectItem>
                          <SelectItem value="L">L</SelectItem>
                          <SelectItem value="custom">custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {inputs.TIV_units === 'custom' && (
                      <div className="space-y-3 p-4 bg-warning/5 border border-warning/20 rounded-lg">
                        <Label htmlFor="TIV_custom_multiplier" className="text-sm font-medium text-warning-foreground">Custom multiplier to convert to mL</Label>
                        <Input
                          id="TIV_custom_multiplier"
                          type="number"
                          step="any"
                          value={inputs.TIV_custom_multiplier}
                          onChange={(e) => handleInputChange('TIV_custom_multiplier', e.target.value)}
                          className={`h-10 ${errors.TIV_custom_multiplier ? 'border-destructive' : ''}`}
                          placeholder="1"
                        />
                        {errors.TIV_custom_multiplier && (
                          <p className="text-sm text-destructive font-medium animate-fade-in" role="alert">
                            {errors.TIV_custom_multiplier}
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                      <div className="flex justify-between text-sm text-muted-foreground font-mono">
                        <span>0</span>
                        <span className="font-semibold text-primary">{inputs.TIV_entered ? `${Number(inputs.TIV_entered).toLocaleString()} ${inputs.TIV_units}` : `0 ${inputs.TIV_units}`}</span>
                        <span>{getSliderRange('TIV_entered').max.toLocaleString()}</span>
                      </div>
                      <Slider
                        value={[Number(inputs.TIV_entered) || 0]}
                        onValueChange={(value) => handleSliderChange('TIV_entered', value)}
                        min={getSliderRange('TIV_entered').min}
                        max={getSliderRange('TIV_entered').max}
                        step={getSliderRange('TIV_entered').step}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <p id="TIV_entered-help" className="text-sm text-muted-foreground">
                    Enter the TIV value and select appropriate units
                  </p>
                  {errors.TIV_entered && (
                    <p id="TIV_entered-error" className="text-sm text-destructive font-medium animate-fade-in" role="alert">
                      {errors.TIV_entered}
                    </p>
                  )}
                </div>

                <Button onClick={handleReset} variant="outline" className="w-full h-12 text-base hover:bg-destructive/10 hover:text-destructive transition-colors">
                  Reset All Fields
                </Button>
              </CardContent>
            </Card>

            {/* Results Card */}
            <Card className="medical-card border-0 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold">🧠</span>
                  </div>
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {computedResults ? (
                  <div className="space-y-6 animate-fade-in">
                    <div className="grid gap-4">
                      <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                        <span className="text-base font-medium">Participant Ch4 GMD (scaled):</span>
                        <span className="mono-data text-lg text-primary">{computedResults.participantCh4GMD.toFixed(4)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                        <span className="text-base font-medium">Predicted Value:</span>
                        <span className="mono-data text-lg text-primary">{computedResults.predicted.toFixed(4)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                        <span className="text-base font-medium">Z-score:</span>
                        <span className="mono-data text-lg text-primary">{computedResults.z.toFixed(4)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center p-6 bg-gradient-to-r from-muted/30 to-muted/50 rounded-xl border">
                        <span className="text-lg font-semibold">Classification:</span>
                        <div 
                          className={`px-6 py-3 rounded-full font-bold text-base transition-all duration-300 ${
                            computedResults.classification === 'Normal Ch4 GMD' 
                              ? 'bg-success text-success-foreground animate-pulse-glow' 
                              : 'bg-destructive text-destructive-foreground animate-pulse-glow'
                          }`}
                        >
                          {computedResults.classification}
                        </div>
                      </div>
                    </div>
                    
                    {/* Debug Panel */}
                    <Collapsible open={showDebug} onOpenChange={setShowDebug}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/20 hover:bg-muted/40 transition-colors">
                          <span className="font-medium">🔬 Debug Panel</span>
                          {showDebug ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-4 border-t animate-fade-in">
                        <div className="grid gap-2 text-sm bg-muted/20 p-4 rounded-lg font-mono">
                          <div className="flex justify-between border-b border-border/30 pb-1">
                            <span>Intercept term:</span>
                            <span className="text-primary font-semibold">{computedResults.debug.intercept_term.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/30 pb-1">
                            <span>Age term:</span>
                            <span className="text-primary font-semibold">{computedResults.debug.age_term.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/30 pb-1">
                            <span>Sex term:</span>
                            <span className="text-primary font-semibold">{computedResults.debug.sex_term.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/30 pb-1">
                            <span>TIV term:</span>
                            <span className="text-primary font-semibold">{computedResults.debug.tiv_term.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/30 pb-1">
                            <span>Effective TIV (mL):</span>
                            <span className="text-accent font-semibold">{computedResults.TIV_effective_mL.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sex mapping (0/1):</span>
                            <span className="text-accent font-semibold">{computedResults.sex01}</span>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    
                    <Button 
                      onClick={handleCopyJSON} 
                      className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary-glow transition-all duration-300 medical-glow"
                    >
                      📋 Copy JSON Results
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-20 h-20 mx-auto bg-muted/30 rounded-full flex items-center justify-center">
                      <span className="text-3xl opacity-50">🔬</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-muted-foreground">
                        Complete all required fields to see results
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Enter patient data above to perform Ch4 GMD analysis
                      </p>
                    </div>
                    <Button disabled className="w-full h-12 text-base">
                      📋 Copy JSON Results
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="text-center space-y-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="p-6 bg-warning/10 border border-warning/20 rounded-xl">
              <p className="text-base text-warning-foreground font-medium italic">
                ⚠️ Research decision-support only; not standalone for clinical care.
              </p>
            </div>
            
            {/* Creator Information */}
            <div className="p-6 medical-card rounded-xl">
              <div className="space-y-3">
                <p className="text-lg font-semibold text-foreground">
                  Created by
                </p>
                <div className="space-y-1">
                  <p className="text-xl font-bold medical-heading">
                    Ahmed Negida, MD, PhD
                  </p>
                  <p className="text-base text-muted-foreground font-medium">
                    Parkinson and Movement Disorder Center
                  </p>
                  <p className="text-base text-muted-foreground">
                    VCU Neurology, Richmond, VA
                  </p>
                  <p className="text-sm text-muted-foreground font-mono mt-3 p-2 bg-muted/20 rounded-lg">
                    ahmed[dot]said[dot]negida[at]gmail[dot]com
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;