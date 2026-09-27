#!/usr/bin/env bash
# Rebuild the master opponent's engine: Rapfi (https://github.com/dhbloo/rapfi,
# GPL-3.0) compiled to single-threaded WebAssembly with its classical evaluation
# (rapfi-networks, CC0). Output goes to public/engines/rapfi/, which the game
# downloads only when the master opponent is picked.
#
# Needs git, curl, cmake and emsdk (EMSDK=/path/to/emsdk, or emcc on PATH).
set -euo pipefail

RAPFI_COMMIT=3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7
NETWORKS_COMMIT=e32ad77a5364363b3e3a02b3f9e8610ade19ea98
NETWORKS_RAW="https://raw.githubusercontent.com/dhbloo/rapfi-networks/${NETWORKS_COMMIT}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/public/engines/rapfi"
WORK="${WORK:-$(mktemp -d)}"

if [ -n "${EMSDK:-}" ]; then
  # shellcheck disable=SC1091
  source "${EMSDK}/emsdk_env.sh" >/dev/null
fi
command -v emcmake >/dev/null || { echo "emsdk not found: set EMSDK=/path/to/emsdk" >&2; exit 1; }

git clone --quiet https://github.com/dhbloo/rapfi.git "${WORK}/rapfi"
git -C "${WORK}/rapfi" checkout --quiet "${RAPFI_COMMIT}"

# Only the small classical evaluation is bundled (the NNUE weights are ~10 MB each).
NET="${WORK}/rapfi/Networks"
mkdir -p "${NET}"
curl -fsSL "${NETWORKS_RAW}/config-example/gomocalc-classical220723.toml" -o "${NET}/config.toml"
curl -fsSL "${NETWORKS_RAW}/classical/model220723.bin" -o "${NET}/model220723.bin"
echo "87e46558cfe89760d90a012983e6d4d1e1b48c34c042e7746e64b12649fc434f  ${NET}/config.toml
fc4abeb0455c19fd9657d90f3c34b2f49bb7355e4ef2d33de56e7be0ffa05d5b  ${NET}/model220723.bin" | sha256sum -c --quiet
printf 'config.toml@config.toml\nmodel220723.bin@model220723.bin\n' > "${NET}/wasm_preloads.txt"

cd "${WORK}/rapfi/Rapfi"
emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release \
  -DNO_MULTI_THREADING=ON -DNO_COMMAND_MODULES=ON -DUSE_WASM_SIMD=ON \
  -DUSE_SSE=OFF -DUSE_AVX2=OFF -DUSE_AVX512=OFF -DUSE_BMI2=OFF -DUSE_VNNI=OFF >/dev/null
cmake --build build-wasm -j"$(nproc 2>/dev/null || echo 4)" >/dev/null

mkdir -p "${OUT}"
cp build-wasm/rapfi-single-simd128.js build-wasm/rapfi-single-simd128.wasm build-wasm/rapfi-single-simd128.data "${OUT}/"
cp "${WORK}/rapfi/Copying.txt" "${OUT}/COPYING"
echo "Built Rapfi ${RAPFI_COMMIT} into ${OUT}"
ls -l "${OUT}"
