export interface ShaftTorqueResult {
  powerKw:number; speedRpm:number; torqueNm:number; equation:string; status:"CALCULATED";
}

/** Ideal power-to-torque conversion; input units must be kW and rpm. */
export function shaftTorque(powerKw:number,speedRpm:number):ShaftTorqueResult {
  if(typeof powerKw!=="number"||!Number.isFinite(powerKw)||powerKw<=0)
    throw new Error("powerKw must be a positive finite number.");
  if(typeof speedRpm!=="number"||!Number.isFinite(speedRpm)||speedRpm<=0)
    throw new Error("speedRpm must be a positive finite number.");
  const torque=9550*powerKw/speedRpm;
  if(!Number.isFinite(torque)||torque<=0)
    throw new Error("Calculated torque is outside the finite numeric range.");
  return {powerKw,speedRpm,torqueNm:torque,equation:"T = 9550 P(kW) / n(rpm)",status:"CALCULATED"};
}
