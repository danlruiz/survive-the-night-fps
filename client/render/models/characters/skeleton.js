// The humanoid rig every survivor and every humanoid kind of the dead is built on: its bones' indices (in the order
// addHumanoidBones adds them; index 0 is skinning.js's fx bone), the proportions they are placed by (humanP), and
// the bones themselves.
export const ROOT = 1, HIPS = 2, SPINE = 3, CHEST = 4, NECK = 5, HEAD = 6, JAW = 7;
export const CLAV_L = 8, UARM_L = 9, FARM_L = 10, HAND_L = 11;
export const CLAV_R = 12, UARM_R = 13, FARM_R = 14, HAND_R = 15;
export const THIGH_L = 16, SHIN_L = 17, FOOT_L = 18, THIGH_R = 19, SHIN_R = 20, FOOT_R = 21;

export function humanP(o) {
  const P = Object.assign(
    {
      hipY: 0.93, hipW: 0.095, thighLen: 0.43, shinLen: 0.42,
      spineLen: 0.13, chestLen: 0.2, neckOff: 0.2, neckLen: 0.09, headR: 0.11,
      shoulderW: 0.185, shoulderDrop: 0.05, uarmLen: 0.29, farmLen: 0.26, handLen: 0.17,
      depth: 0.13, neckZ: 0, headZ: 0,
    },
    o
  );
  P.thighY = P.hipY - 0.03;
  P.kneeY = P.thighY - P.thighLen;
  P.ankleY = P.kneeY - P.shinLen;
  P.spineY = P.hipY + P.spineLen;
  P.chestY = P.spineY + P.chestLen;
  P.neckY = P.chestY + P.neckOff;
  P.headY = P.neckY + P.neckLen;
  P.shoulderY = P.neckY - P.shoulderDrop;
  P.elbowY = P.shoulderY - P.uarmLen;
  P.wristY = P.elbowY - P.farmLen;
  return P;
}

export function addHumanoidBones(mb, P) {
  mb.addBone('root', null, 0, 0, 0);
  mb.addBone('hips', 'root', 0, P.hipY, 0);
  mb.addBone('spine', 'hips', 0, P.spineY, 0);
  mb.addBone('chest', 'spine', 0, P.chestY, 0);
  mb.addBone('neck', 'chest', 0, P.neckY, P.neckZ);
  mb.addBone('head', 'neck', 0, P.headY, P.headZ);
  mb.addBone('jaw', 'head', 0, P.headY + P.headR * 0.42, P.headZ - P.headR * 0.12);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    mb.addBone('clav' + n, 'chest', s * 0.04, P.shoulderY + 0.01, 0);
    mb.addBone('uarm' + n, 'clav' + n, s * P.shoulderW, P.shoulderY, 0);
    mb.addBone('farm' + n, 'uarm' + n, s * P.shoulderW, P.elbowY, 0);
    mb.addBone('hand' + n, 'farm' + n, s * P.shoulderW, P.wristY, 0);
  }
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    mb.addBone('thigh' + n, 'hips', s * P.hipW, P.thighY, 0);
    mb.addBone('shin' + n, 'thigh' + n, s * P.hipW, P.kneeY, 0);
    mb.addBone('foot' + n, 'shin' + n, s * P.hipW, P.ankleY, 0);
  }
}
