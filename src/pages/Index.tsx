import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';

// Model coefficients and parameters for easy editing
const COEF = {
  intercept: 1.57859,
  ageAtMRI: -0.1078075,
  sex: 0.8647528,
  totalIntracranialVolume: 0.0096637,
  standardDeviation: 2.2252,
  threshold: -1
};

interface InputData {
  participantCh4GMD: string;
  ageAtMRI: string;
  sex: string;
  totalIntracranialVolume: string;
}

interface ValidationErrors {
  participantCh4GMD?: string;
  ageAtMRI?: string;
  sex?: string;
  totalIntracranialVolume?: string;
}

const Index = () => {
  const { toast } = useToast();
  
  const [inputs, setInputs] = useState<InputData>({
    participantCh4GMD: '',
    ageAtMRI: '',
    sex: '',
    totalIntracranialVolume: ''
  });

  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateField = useCallback((key: keyof InputData, value: string): string | undefined => {
    if (!value.trim()) {
      return 'This field is required';
    }
    
    if (key === 'sex') {
      if (value !== '0' && value !== '1') {
        return 'Sex must be 0 (female) or 1 (male)';
      }
      return;
    }
    
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return 'Must be a valid number';
    }
    
    if (key === 'ageAtMRI' && (numValue < 0 || numValue > 120)) {
      return 'Age must be between 0 and 120 years';
    }
    
    if ((key === 'participantCh4GMD' || key === 'totalIntracranialVolume') && numValue < 0) {
      return 'Value must be positive';
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
      case 'participantCh4GMD':
        return { min: 0, max: 10, step: 0.01 };
      case 'ageAtMRI':
        return { min: 0, max: 120, step: 1 };
      case 'totalIntracranialVolume':
        return { min: 0, max: 2000000, step: 1000 };
      default:
        return { min: 0, max: 100, step: 1 };
    }
  };

  const isValid = useMemo(() => {
    const hasAllFields = Object.values(inputs).every(value => value.trim() !== '');
    const hasNoErrors = Object.keys(errors).length === 0;
    const noNaNValues = Object.entries(inputs).every(([key, value]) => {
      if (key === 'sex') return value === '0' || value === '1';
      return !isNaN(Number(value));
    });
    
    return hasAllFields && hasNoErrors && noNaNValues;
  }, [inputs, errors]);

  const computedResults = useMemo(() => {
    if (!isValid) return null;
    
    const participantCh4GMD = Number(inputs.participantCh4GMD);
    const ageAtMRI = Number(inputs.ageAtMRI);
    const sex = Number(inputs.sex);
    const totalIntracranialVolume = Number(inputs.totalIntracranialVolume);
    
    // Exact computation as specified
    const predicted = COEF.intercept + 
      (COEF.ageAtMRI * ageAtMRI) + 
      (COEF.sex * sex) + 
      (COEF.totalIntracranialVolume * totalIntracranialVolume);
    
    const z = (participantCh4GMD - predicted) / COEF.standardDeviation;
    
    const classification = z < COEF.threshold ? 'Low Ch4 GMD' : 'Normal Ch4 GMD';
    
    return {
      ch4Predicted: predicted,
      ch4ZRegressed: z,
      classification
    };
  }, [inputs, isValid]);

  const handleReset = useCallback(() => {
    setInputs({
      participantCh4GMD: '',
      ageAtMRI: '',
      sex: '',
      totalIntracranialVolume: ''
    });
    setErrors({});
  }, []);

  const handleCopyJSON = useCallback(async () => {
    if (!computedResults) return;
    
    const jsonOutput = {
      input: {
        participantCh4GMD: Number(inputs.participantCh4GMD),
        ageAtMRI: Number(inputs.ageAtMRI),
        sex: Number(inputs.sex),
        totalIntracranialVolume: Number(inputs.totalIntracranialVolume)
      },
      computed: {
        ch4Predicted: computedResults.ch4Predicted,
        ch4ZRegressed: computedResults.ch4ZRegressed,
        classification: computedResults.classification
      },
      formula: {
        predicted: "1.57859 + (-0.1078075 * ageAtMRI) + (0.8647528 * sex) + (0.0096637 * totalIntracranialVolume)",
        z: "(participantCh4GMD - predicted) / 2.2252",
        rule: "z < -1 ⇒ Low; otherwise ⇒ Normal"
      },
      context: {
        intendedUse: "PD-MCI subtyping tool for research/decision support"
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
                <Label htmlFor="participantCh4GMD">Participant Ch4 GMD</Label>
                <div className="space-y-3">
                  <Input
                    id="participantCh4GMD"
                    type="number"
                    step="any"
                    value={inputs.participantCh4GMD}
                    onChange={(e) => handleInputChange('participantCh4GMD', e.target.value)}
                    className={errors.participantCh4GMD ? 'border-destructive' : ''}
                    aria-describedby="participantCh4GMD-error"
                    placeholder="0.00"
                  />
                  {inputs.participantCh4GMD && !isNaN(Number(inputs.participantCh4GMD)) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{inputs.participantCh4GMD}</span>
                        <span>10</span>
                      </div>
                      <Slider
                        value={[Number(inputs.participantCh4GMD) || 0]}
                        onValueChange={(value) => handleSliderChange('participantCh4GMD', value)}
                        min={0}
                        max={10}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
                {errors.participantCh4GMD && (
                  <p id="participantCh4GMD-error" className="text-sm text-destructive" role="alert">
                    {errors.participantCh4GMD}
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
                <Label htmlFor="sex">Sex (0/1)</Label>
                <Select value={inputs.sex} onValueChange={(value) => handleInputChange('sex', value)}>
                  <SelectTrigger className={errors.sex ? 'border-destructive' : ''} aria-describedby="sex-help sex-error">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Female</SelectItem>
                    <SelectItem value="1">1 - Male</SelectItem>
                  </SelectContent>
                </Select>
                <p id="sex-help" className="text-sm text-muted-foreground">
                  0 = female, 1 = male
                </p>
                {errors.sex && (
                  <p id="sex-error" className="text-sm text-destructive" role="alert">
                    {errors.sex}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="totalIntracranialVolume">Total Intracranial Volume</Label>
                <div className="space-y-3">
                  <Input
                    id="totalIntracranialVolume"
                    type="number"
                    step="any"
                    value={inputs.totalIntracranialVolume}
                    onChange={(e) => handleInputChange('totalIntracranialVolume', e.target.value)}
                    className={errors.totalIntracranialVolume ? 'border-destructive' : ''}
                    aria-describedby="totalIntracranialVolume-help totalIntracranialVolume-error"
                    placeholder="1500000"
                  />
                  {inputs.totalIntracranialVolume && !isNaN(Number(inputs.totalIntracranialVolume)) && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{Number(inputs.totalIntracranialVolume).toLocaleString()} mm³</span>
                        <span>2M</span>
                      </div>
                      <Slider
                        value={[Number(inputs.totalIntracranialVolume) || 0]}
                        onValueChange={(value) => handleSliderChange('totalIntracranialVolume', value)}
                        min={0}
                        max={2000000}
                        step={1000}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
                <p id="totalIntracranialVolume-help" className="text-sm text-muted-foreground">
                  Same units as the model (typically mm³)
                </p>
                {errors.totalIntracranialVolume && (
                  <p id="totalIntracranialVolume-error" className="text-sm text-destructive" role="alert">
                    {errors.totalIntracranialVolume}
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
                      <span className="text-sm font-medium">Predicted Ch4:</span>
                      <span className="font-mono text-sm">{computedResults.ch4Predicted.toFixed(4)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Regressed Z-score:</span>
                      <span className="font-mono text-sm">{computedResults.ch4ZRegressed.toFixed(4)}</span>
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
