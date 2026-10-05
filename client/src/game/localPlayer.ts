import {
  INPUT_DT,
  STAND_EYE_HEIGHT,
  clamp,
  createMoveState,
  eyeHeight,
  stepMovement,
  type Box,
  type InputCommand,
  type MoveInput,
  type MoveState,
  type SelfSnapshot,
  type Vec3,
} from '@mp-fps/shared';
import * as THREE from 'three';

const MOUSE_RADIANS_PER_PIXEL = 0.0022;
const MAX_PITCH = THREE.MathUtils.degToRad(88);
const RECOIL_RECOVERY = 4;
/** Share of recoil that stays (you have to pull down), the rest recovers by itself. */
const PERMANENT_RECOIL = 0.35;

export type Controls = Omit<MoveInput, 'yaw' | 'pitch'>;

/**
 * The player we control. Movement is predicted locally with the shared step function
 * (instant response) and corrected when the server's authoritative state arrives.
 */
export class LocalPlayer {
  state: MoveState = createMoveState({ x: 0, y: 0, z: 0 });
  yaw = 0;
  pitch = 0;
  alive = false;
  speedMultiplier = 1;
  /** Up/down camera offset from walking, also used by the weapon viewmodel. */
  bob = 0;
  bobSide = 0;

  private recoilPitch = 0;
  private recoilYaw = 0;
  private previousPos: Vec3 = { x: 0, y: 0, z: 0 };
  private accumulator = 0;
  private seq = 0;
  private pending: InputCommand[] = [];
  private outbox: InputCommand[] = [];
  private readonly correction = new THREE.Vector3();
  private smoothEye = STAND_EYE_HEIGHT;
  private smoothY = 0;
  private bobPhase = 0;

  constructor(private readonly world: Box[]) {}

  get aimYaw(): number {
    return this.yaw + this.recoilYaw;
  }

  get aimPitch(): number {
    return clamp(this.pitch + this.recoilPitch, -MAX_PITCH, MAX_PITCH);
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.state.vel.x, this.state.vel.z);
  }

  spawn(pos: Vec3, yaw: number): void {
    this.state = createMoveState(pos);
    this.previousPos = { ...pos };
    this.smoothY = pos.y;
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = this.recoilYaw = 0;
    this.pending = [];
    this.correction.set(0, 0, 0);
    this.alive = true;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * MOUSE_RADIANS_PER_PIXEL * sensitivity;
    this.pitch = clamp(this.pitch - dy * MOUSE_RADIANS_PER_PIXEL * sensitivity, -MAX_PITCH, MAX_PITCH);
  }

  addRecoil(pitch: number, yaw: number): void {
    this.pitch = clamp(this.pitch + pitch * PERMANENT_RECOIL, -MAX_PITCH, MAX_PITCH);
    this.recoilPitch += pitch * (1 - PERMANENT_RECOIL);
    this.recoilYaw += yaw;
  }

  /** Runs the fixed-rate movement steps that fit in this frame. */
  update(dt: number, controls: Controls): void {
    const decay = Math.exp(-RECOIL_RECOVERY * dt);
    this.recoilPitch *= decay;
    this.recoilYaw *= decay;
    this.correction.multiplyScalar(Math.exp(-10 * dt));
    if (!this.alive) return;

    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= INPUT_DT) {
      this.accumulator -= INPUT_DT;
      const input: InputCommand = { ...controls, yaw: this.aimYaw, pitch: this.aimPitch, seq: this.seq++ };
      this.previousPos = { ...this.state.pos };
      this.state = stepMovement(this.state, input, INPUT_DT, this.world, this.speedMultiplier);
      this.pending.push(input);
      this.outbox.push(input);
    }

    const speed = this.state.onGround ? this.horizontalSpeed : 0;
    this.bobPhase += dt * speed * 1.6;
    const amount = Math.min(speed / 7.5, 1);
    this.bob = Math.sin(this.bobPhase * 2) * 0.035 * amount;
    this.bobSide = Math.cos(this.bobPhase) * 0.025 * amount;
    this.smoothEye += (eyeHeight(this.state.crouching) - this.smoothEye) * (1 - Math.exp(-12 * dt));
  }

  /** Inputs not yet sent to the server. */
  takeOutbox(): InputCommand[] {
    const inputs = this.outbox;
    this.outbox = [];
    return inputs;
  }

  /** Server reconciliation: start from the server's state and replay the inputs it hasn't seen yet. */
  reconcile(you: SelfSnapshot): void {
    if (!this.alive) return;
    this.pending = this.pending.filter((input) => input.seq > you.lastInputSeq);
    let state = you.move;
    for (const input of this.pending) state = stepMovement(state, input, INPUT_DT, this.world, this.speedMultiplier);

    const error = new THREE.Vector3(
      this.state.pos.x - state.pos.x,
      this.state.pos.y - state.pos.y,
      this.state.pos.z - state.pos.z,
    );
    // Small differences are smoothed out visually; big ones (teleports) snap.
    if (error.length() < 2) this.correction.add(error);
    else this.correction.set(0, 0, 0);
    this.previousPos = {
      x: this.previousPos.x - error.x,
      y: this.previousPos.y - error.y,
      z: this.previousPos.z - error.z,
    };
    this.state = state;
  }

  /** Smoothed eye position for the camera. */
  eyePosition(dt: number): THREE.Vector3 {
    const t = this.accumulator / INPUT_DT;
    const x = THREE.MathUtils.lerp(this.previousPos.x, this.state.pos.x, t) + this.correction.x;
    const y = THREE.MathUtils.lerp(this.previousPos.y, this.state.pos.y, t) + this.correction.y;
    const z = THREE.MathUtils.lerp(this.previousPos.z, this.state.pos.z, t) + this.correction.z;
    // Ease the camera up stairs, but follow falls exactly.
    this.smoothY = y > this.smoothY ? this.smoothY + (y - this.smoothY) * (1 - Math.exp(-18 * dt)) : y;
    return new THREE.Vector3(x, this.smoothY + this.smoothEye + this.bob, z);
  }
}
