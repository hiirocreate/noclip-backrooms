// ポストエフェクト：フィルムノイズ、周辺減光、色収差、正気度による歪み
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    fear: { value: 0 },      // 0..1 近くに何かいる
    insanity: { value: 0 },  // 0..1 正気度の低さ
    grain: { value: 1 },
    flash: { value: 0 },
    ghost: { value: 0 },     // 0..1 二重に見える(正気度低下)
    pulse: { value: 0 },     // 0..1 鼓動に合わせて視界の端が暗くなる
    invert: { value: 0 },    // 0..1 一瞬の反転(幻覚)
    blood: { value: 0 },     // 0..1 画面の端から赤く染まる(捕まった瞬間)
    blackout: { value: 0 },  // 0..1 一瞬の暗転(正気度低下)
    tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, fear, insanity, grain, flash, ghost, pulse, invert, blood, blackout;
    uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // 正気が減ると画面がうねる
      float w = insanity * insanity;
      uv.x += sin(uv.y * 14.0 + time * 1.7) * 0.004 * w;
      uv.y += cos(uv.x * 11.0 + time * 1.3) * 0.004 * w;
      // 横方向のグリッチ
      float band = step(0.985 - fear * 0.03 - w * 0.03, hash(vec2(floor(uv.y * 40.0), floor(time * 12.0))));
      uv.x += band * (hash(vec2(time, uv.y)) - 0.5) * 0.05 * grain;
      float ca = (0.0015 + fear * 0.006 + w * 0.006) * grain;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // 二重視：少しずれた位置にもう一枚、ゆっくり漂う像を重ねる
      if (ghost > 0.001) {
        vec2 go = vec2(sin(time * 0.73), cos(time * 0.51)) * 0.018 * ghost + vec2(0.006, 0.0) * ghost;
        vec3 g2 = texture2D(tDiffuse, uv + go).rgb;
        col = mix(col, max(col, g2 * 1.05), 0.55 * ghost);
      }
      col *= tint;
      // 彩度低下
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), 0.15 + w * 0.5);
      if (insanity > 0.6) col = mix(col, vec3(l * 1.1, l * 0.7, l * 0.7), (insanity - 0.6) * 0.8);
      // 周辺減光
      float vig = smoothstep(0.85, 0.2 - fear * 0.1, length(c * vec2(1.25, 1.0)));
      col *= mix(0.25, 1.0, vig);
      // 鼓動に合わせて視界が狭まる(トンネル視)
      float rr = length(c * vec2(1.3, 1.0));
      col *= 1.0 - pulse * smoothstep(0.18, 0.62, rr) * 0.85;
      // 端から血がにじむように赤くなる
      float bl = blood * smoothstep(0.2, 0.75, rr + (hash(floor(uv * 60.0)) - 0.5) * 0.08);
      col = mix(col, vec3(0.35, 0.0, 0.01) + col * vec3(0.6, 0.05, 0.05), bl);
      // フィルムノイズ
      float n = hash(uv * vec2(1920.0, 1080.0) + fract(time * 7.0) * 100.0) - 0.5;
      col += n * ((0.012 + fear * 0.03 + w * 0.02) + col * (0.22 + fear * 0.2)) * grain;
      // 走査線
      col *= 1.0 - 0.04 * grain * sin(uv.y * 900.0 + time * 30.0);
      col += flash;
      col = mix(col, vec3(1.0) - col, invert);
      col *= 1.0 - blackout;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(HorrorShader);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
    this.u = this.pass.uniforms;
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  setPixelRatio(r) { this.composer.setPixelRatio(r); }
  render(dt) { this.composer.render(dt); }
}
