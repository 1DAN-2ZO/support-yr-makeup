/**
 * 찍혔다는 신호 — 짧은 소리 + 진동. 본 앱 `screens/capture.ts` 안에 있던 것을 그대로 떼어 왔다.
 * React 를 모르는 코드라 `lib/` 에 둔다 (화면이 다시 그려질 때마다 AudioContext 를 새로 만들지 않게).
 *
 * 자동으로 찍히니 이 소리가 "찍혔다" 는 유일한 신호다. 진동은 기기 진동 세기 설정을 따라
 * 안 느껴지기도 해서(2026-09-28 Android: 소리만 들림) 소리를 늘 같이 낸다. iOS 는 진동이 없다.
 */

let audio: AudioContext | null = null;

/**
 * 소리를 미리 열어 둔다. **사용자가 누르는 그 순간에 불러야 한다** —
 * iOS 는 탭 밖에서 만든 AudioContext 를 멈춤 상태로 두어, 나중에 찍을 때 "삑" 이 안 난다.
 * 본 앱에서는 동의 화면의 "동의하고 시작" 이 부른다 (screens/consent.ts).
 */
export function unlockShutterCue(): void {
  try { audio ??= new AudioContext(); void audio.resume(); } catch { /* 소리 못 염 */ }
}

/** 눈 감는 장은 높은 "삑", 나머지는 낮은 "톡". 지금은 눈 뜬 장 하나뿐이라 늘 "톡" (#386) */
export function shutterCue(eyesClosed: boolean): void {
  try { navigator.vibrate?.(200); } catch { /* 지원 안 함 */ }
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = eyesClosed ? 880 : 520;
    g.gain.value = 0.15;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (eyesClosed ? 0.15 : 0.08));
  } catch { /* 소리 못 냄 — 진동·번쩍임만 */ }
}
