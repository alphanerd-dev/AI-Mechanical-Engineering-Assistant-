export interface ShaftTorqueResult {
  powerKw:number; speedRpm:number; torqueNm:number; equation:string; status:"CALCULATED";
}
export function shaftTorque(powerKw:number,speedRpm:number):ShaftTorqueResult {
  if(powerKw<=0||speedRpm<=0) throw new Error("Power and speed must be positive");
  const torque=9550*powerKw/speedRpm;
  return {powerKw,speedRpm,torqueNm:torque,equation:"T = 9550 P(kW) / n(rpm)",status:"CALCULATED"};
}
