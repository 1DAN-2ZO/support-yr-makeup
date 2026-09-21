#!/usr/bin/env bash
# 실기기 https 인증서 만들기 (6-3, #74)
#
#   bash scripts/certs.sh
#
# 왜 필요한가: 카메라는 https 또는 localhost 에서만 열린다. 폰은 LAN IP 로 들어오므로
# https 가 없으면 getUserMedia 가 아예 없는 것처럼 동작한다 — 권한 거부가 아니라서 헷갈린다.
#
# 만들어지는 것: client/certs/{key,cert}.pem  (저장소에 안 올라간다)
# 폰에서 한 번 해야 하는 것: 루트 CA 설치 — 아래 안내가 뜬다. docs/device-setup-v6.md 참고.

set -euo pipefail
cd "$(dirname "$0")/.."

OUT="client/certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert 가 없습니다. 먼저 설치하세요:"
  echo "  Windows : winget install FiloSottile.mkcert   (또는 choco install mkcert)"
  echo "  macOS   : brew install mkcert"
  echo "  Linux   : https://github.com/FiloSottile/mkcert#linux"
  echo
  echo "설치가 어려우면 인증서 없이 가는 방법도 있습니다 — docs/device-setup-v6.md 의 '터널' 쪽."
  exit 1
fi

# 이 PC 의 LAN 주소. 폰이 실제로 접속할 주소라 인증서에 꼭 들어가야 한다
lan_ip() {
  case "$(uname -s)" in
    Darwin)
      for i in en0 en1 en2; do ipconfig getifaddr "$i" 2>/dev/null && return 0; done
      ;;
    Linux)
      hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | head -1 && return 0
      ;;
    *)
      # Git Bash / MSYS
      ipconfig 2>/dev/null \
        | tr -d '\r' \
        | grep -i 'IPv4' \
        | sed 's/.*: //' \
        | grep -v '^127\.' \
        | head -1 && return 0
      ;;
  esac
  return 1
}

# IP=192.168.0.7 로 직접 넘길 수도 있다 (랜카드가 여러 개라 자동 탐지가 엉뚱할 때)
IP="${IP:-$(lan_ip || true)}"
if [ -z "$IP" ]; then
  echo "LAN IP 를 못 찾았습니다. 직접 넣어 주세요:"
  echo "  IP=192.168.0.7 bash scripts/certs.sh"
  exit 1
fi

mkdir -p "$OUT"

# 이 PC 를 발급자로 등록한다. 처음 한 번만 관리자 암호를 물어본다
mkcert -install

mkcert -key-file "$OUT/key.pem" -cert-file "$OUT/cert.pem" \
  localhost 127.0.0.1 ::1 "$IP"

CAROOT="$(mkcert -CAROOT)"

echo
echo "인증서를 만들었습니다 — $OUT/"
echo
echo "1) 서버 켜기 :  cd client && npm run dev"
echo "2) 폰에서 열기:  https://$IP:5173"
echo
echo "폰이 '안전하지 않음' 이라고 하면 루트 CA 를 아직 안 믿는 것입니다."
echo "이 파일을 폰으로 보내서 설치하세요 (메일·에어드랍·USB 아무거나):"
echo "  $CAROOT/rootCA.pem"
echo
echo "  iOS     : 파일 열기 → 설정에 '프로파일 다운로드됨' → 설치"
echo "            → 설정 > 일반 > 정보 > 인증서 신뢰 설정 에서 스위치 켜기 (이거 안 켜면 계속 막힙니다)"
echo "  Android : 설정 > 보안 > 암호화 및 자격 증명 > 인증서 설치 > CA 인증서"
echo
echo "자세한 절차와 막혔을 때: docs/device-setup-v6.md"
