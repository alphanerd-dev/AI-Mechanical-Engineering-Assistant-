export interface ShaftSizingInput {
  powerKw:number;
  speedRpm:number;
  bendingMomentNm:number;
  allowableShearStressMpa:number;
  kb?:number;
  kt?:number;
}
export interface ShaftSizingResult {
  torqueNm:number;
  equivalentTorqueNm:number;
  minimumDiameterMm:number;
  assumptions:{kb:number;kt:number};
  equation:string;
  status:"CALCULATED";
}
export function sizeSolidShaft(input:ShaftSizingInput):ShaftSizingResult {
  const {powerKw,speedRpm,bendingMomentNm,allowableShearStressMpa}=input;
  const kb=input.kb ?? 1.5;
  const kt=input.kt ?? 1.0;
  if(powerKw<=0||speedRpm<=0||bendingMomentNm<0||allowableShearStressMpa<=0) {
    throw new Error("Power, speed and allowable stress must be positive; bending moment cannot be negative");
  }
  const torqueNm=9550*powerKw/speedRpm;
  const equivalentTorqueNm=Math.sqrt((kb*bendingMomentNm)**2+(kt*torqueNm)**2);
  const diameterM=Math.cbrt((16*equivalentTorqueNm)/(Math.PI*allowableShearStressMpa*1e6));
  return {
    torqueNm,equivalentTorqueNm,minimumDiameterMm:diameterM*1000,
    assumptions:{kb,kt},
    equation:"d = [16·Te/(π·τallow)]^(1/3), Te = √((Kb·M)^2 + (Kt·T)^2)",
    status:"CALCULATED"
  };
}
