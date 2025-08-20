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
  sexCodingInModel: string;
  TIV_entered: string;
  TIV_units: string;
  TIV_custom_multiplier: string;
}

interface ValidationErrors {
  Ch4std?: string;
  ageAtMRI?: string;
  sex?: string;
  sexCodingInModel?: string;
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
    sexCodingInModel: 'male=1',
    TIV_entered: '',
    TIV_units: 'mL',
    TIV_custom_multiplier: '1'
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showDebug, setShowDebug] = useState(false);

  const validateField = useCallback((key: keyof InputData, value: string): string | undefined => {
    if (key === 'sex' || key === 'sexCodingInModel' || key === 'TIV_units') {
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
    const requiredFields = ['Ch4std', 'ageAtMRI', 'sex', 'sexCodingInModel', 'TIV_entered'];
    const hasAllFields = requiredFields.every(field => inputs[field as keyof InputData].trim() !== '');
    const hasNoErrors = Object.keys(errors).length === 0;
    const noNaNValues = requiredFields.every(field => {
      const value = inputs[field as keyof InputData];
      if (field === 'sex' || field === 'sexCodingInModel') return value !== '';
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
    
    // Map sex to 0/1 based on coding
    const sex01 = inputs.sexCodingInModel === 'male=1' 
      ? (inputs.sex === 'Male' ? 1 : 0)
      : (inputs.sex === 'Female' ? 1 : 0);
    
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
      sexCodingInModel: 'male=1',
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
        sexCodingInModel: inputs.sexCodingInModel,
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">PD-MCI Ch4 Subtyping Tool</h1>
          <p className="text-lg text-muted-foreground">Real-time subtyping of PD-MCI patients by Ch4 GMD</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Inputs Card */}
          <Card>
            <CardHeader>
              <CardTitle>Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="Ch4std">Ch4std (raw MRI measure)</Label>
                <div className="space-y-3">
                  <Input
                    id="Ch4std"
                    type="number"
                    step="any"
                    value={inputs.Ch4std}
                    onChange={(e) => handleInputChange('Ch4std', e.target.value)}
                    className={errors.Ch4std ? 'border-destructive' : ''}
                    aria-describedby="Ch4std-error"
                    placeholder="0.400"
                  />
                  {inputs.Ch4std && !isNaN(Number(inputs.Ch4std)) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{inputs.Ch4std}</span>
                        <span>1</span>
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
                  )}
                </div>
                {errors.Ch4std && (
                  <p id="Ch4std-error" className="text-sm text-destructive" role="alert">
                    {errors.Ch4std}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="ageAtMRI">Age at MRI (years)</Label>
                <div className="space-y-3">
                  <Input
                    id="ageAtMRI"
                    type="number"
                    step="any"
                    value={inputs.ageAtMRI}
                    onChange={(e) => handleInputChange('ageAtMRI', e.target.value)}
                    className={errors.ageAtMRI ? 'border-destructive' : ''}
                    aria-describedby="ageAtMRI-help ageAtMRI-error"
                    placeholder="65"
                  />
                  {inputs.ageAtMRI && !isNaN(Number(inputs.ageAtMRI)) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{inputs.ageAtMRI} years</span>
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
                  )}
                </div>
                <p id="ageAtMRI-help" className="text-sm text-muted-foreground">
                  Age in years at time of MRI scan
                </p>
                {errors.ageAtMRI && (
                  <p id="ageAtMRI-error" className="text-sm text-destructive" role="alert">
                    {errors.ageAtMRI}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sex">Sex</Label>
                <Select value={inputs.sex} onValueChange={(value) => handleInputChange('sex', value)}>
                  <SelectTrigger className={errors.sex ? 'border-destructive' : ''} aria-describedby="sex-error">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
                {errors.sex && (
                  <p id="sex-error" className="text-sm text-destructive" role="alert">
                    {errors.sex}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sexCodingInModel">Which sex = 1 in the model?</Label>
                <Select value={inputs.sexCodingInModel} onValueChange={(value) => handleInputChange('sexCodingInModel', value)}>
                  <SelectTrigger className={errors.sexCodingInModel ? 'border-destructive' : ''} aria-describedby="sexCodingInModel-error">
                    <SelectValue placeholder="Select coding" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male=1">Male = 1</SelectItem>
                    <SelectItem value="female=1">Female = 1</SelectItem>
                  </SelectContent>
                </Select>
                {errors.sexCodingInModel && (
                  <p id="sexCodingInModel-error" className="text-sm text-destructive" role="alert">
                    {errors.sexCodingInModel}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="TIV_entered">Total Intracranial Volume (TIV)</Label>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      id="TIV_entered"
                      type="number"
                      step="any"
                      value={inputs.TIV_entered}
                      onChange={(e) => handleInputChange('TIV_entered', e.target.value)}
                      className={errors.TIV_entered ? 'border-destructive' : ''}
                      aria-describedby="TIV_entered-help TIV_entered-error"
                      placeholder="1500"
                    />
                    <Select value={inputs.TIV_units} onValueChange={(value) => handleInputChange('TIV_units', value)}>
                      <SelectTrigger className="w-32">
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
                    <div className="space-y-2">
                      <Label htmlFor="TIV_custom_multiplier">Custom multiplier to convert to mL</Label>
                      <Input
                        id="TIV_custom_multiplier"
                        type="number"
                        step="any"
                        value={inputs.TIV_custom_multiplier}
                        onChange={(e) => handleInputChange('TIV_custom_multiplier', e.target.value)}
                        className={errors.TIV_custom_multiplier ? 'border-destructive' : ''}
                        placeholder="1"
                      />
                      {errors.TIV_custom_multiplier && (
                        <p className="text-sm text-destructive" role="alert">
                          {errors.TIV_custom_multiplier}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {inputs.TIV_entered && !isNaN(Number(inputs.TIV_entered)) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{Number(inputs.TIV_entered).toLocaleString()} {inputs.TIV_units}</span>
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
                  )}
                </div>
                <p id="TIV_entered-help" className="text-sm text-muted-foreground">
                  Enter the TIV value and select appropriate units
                </p>
                {errors.TIV_entered && (
                  <p id="TIV_entered-error" className="text-sm text-destructive" role="alert">
                    {errors.TIV_entered}
                  </p>
                )}
              </div>

              <Button onClick={handleReset} variant="outline" className="w-full">
                Reset
              </Button>
            </CardContent>
          </Card>

          {/* Results Card */}
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {computedResults ? (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Participant Ch4 GMD (scaled):</span>
                      <span className="font-mono text-sm">{computedResults.participantCh4GMD.toFixed(4)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Predicted:</span>
                      <span className="font-mono text-sm">{computedResults.predicted.toFixed(4)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Z-score:</span>
                      <span className="font-mono text-sm">{computedResults.z.toFixed(4)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Classification:</span>
                      <div 
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          computedResults.classification === 'Normal Ch4 GMD' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}
                      >
                        {computedResults.classification}
                      </div>
                    </div>
                  </div>
                  
                  {/* Debug Panel */}
                  <Collapsible open={showDebug} onOpenChange={setShowDebug}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-2">
                        Debug Panel
                        {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2 border-t">
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Intercept term:</span>
                          <span className="font-mono">{computedResults.debug.intercept_term.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Age term:</span>
                          <span className="font-mono">{computedResults.debug.age_term.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sex term:</span>
                          <span className="font-mono">{computedResults.debug.sex_term.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>TIV term:</span>
                          <span className="font-mono">{computedResults.debug.tiv_term.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Effective TIV (mL):</span>
                          <span className="font-mono">{computedResults.TIV_effective_mL.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sex mapping (0/1):</span>
                          <span className="font-mono">{computedResults.sex01}</span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  
                  <Button onClick={handleCopyJSON} className="w-full">
                    Copy JSON
                  </Button>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Complete all required fields to see results
                  </p>
                  <Button disabled className="w-full mt-4">
                    Copy JSON
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer Disclaimer */}
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground italic">
            Research decision-support only; not standalone for clinical care.
          </p>
          
          {/* Creator Information */}
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Created by</span>
            </p>
            <p className="text-sm text-foreground font-medium">
              Ahmed Negida, MD, PhD
            </p>
            <p className="text-sm text-muted-foreground">
              Parkinson and Movement Disorder Center
            </p>
            <p className="text-sm text-muted-foreground">
              VCU Neurology, Richmond, VA
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              ahmed[dot]said[dot]negida[at]gmail[dot]com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;