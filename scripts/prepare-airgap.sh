#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# BentoPDF Air-Gapped Deployment Preparation Script
# ============================================================
# Automates the creation of a self-contained deployment bundle
# for air-gapped (offline) networks.
#
# Run this on a machine WITH internet access. The output bundle
# contains everything needed to deploy BentoPDF offline.
#
# Usage:
#   bash scripts/prepare-airgap.sh --wasm-base-url https://internal.example.com/wasm
#   bash scripts/prepare-airgap.sh   # interactive mode
#
# See --help for all options.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Output formatting ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }
step()    { echo -e "\n${BOLD}==> $*${NC}"; }

# Disable colors if NO_COLOR is set
if [ -n "${NO_COLOR:-}" ]; then
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# --- Defaults ---
WASM_BASE_URL=""
IMAGE_NAME="bentopdf"
OUTPUT_DIR="./bentopdf-airgap-bundle"
SIMPLE_MODE=""
BASE_URL=""
COMPRESSION_MODE=""
LANGUAGE=""
BRAND_NAME=""
BRAND_LOGO=""
FOOTER_TEXT=""
DOCKERFILE="Dockerfile"
SKIP_DOCKER=false
SKIP_WASM=false
INTERACTIVE=false

# --- Usage ---
usage() {
  cat <<'EOF'
BentoPDF Air-Gapped Deployment Preparation

USAGE:
  bash scripts/prepare-airgap.sh [OPTIONS]
  bash scripts/prepare-airgap.sh                    # interactive mode

REQUIRED:
  --wasm-base-url <url>   Base URL where WASM files will be hosted
                          in the air-gapped network
                          (e.g. https://internal.example.com/wasm)

OPTIONS:
  --image-name <name>     Docker image name          (default: bentopdf)
  --output-dir <path>     Output bundle directory     (default: ./bentopdf-airgap-bundle)
  --dockerfile <path>     Dockerfile to use           (default: Dockerfile)
  --simple-mode           Enable Simple Mode
  --base-url <path>       Subdirectory base URL       (e.g. /pdf/)
  --compression <mode>    Compression: g, b, o, all   (default: all)
  --language <code>       Default UI language          (e.g. fr, de, es)
  --brand-name <name>     Custom brand name
  --brand-logo <path>     Logo path relative to public/
  --footer-text <text>    Custom footer text
  --skip-docker           Skip Docker build and export
  --skip-wasm             Skip WASM download (reuse existing .tgz files)
  --help                  Show this help message

EXAMPLES:
  # Minimal (prompts for WASM URL interactively)
  bash scripts/prepare-airgap.sh

  # Full automation
  bash scripts/prepare-airgap.sh \
    --wasm-base-url https://internal.example.com/wasm \
    --brand-name "AcmePDF" \
    --language fr

  # Skip Docker build (reuse existing image)
  bash scripts/prepare-airgap.sh \
    --wasm-base-url https://internal.example.com/wasm \
    --skip-docker
EOF
  exit 0
}

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wasm-base-url)  WASM_BASE_URL="$2"; shift 2 ;;
    --image-name)     IMAGE_NAME="$2"; shift 2 ;;
    --output-dir)     OUTPUT_DIR="$2"; shift 2 ;;
    --simple-mode)    SIMPLE_MODE="true"; shift ;;
    --base-url)       BASE_URL="$2"; shift 2 ;;
    --compression)    COMPRESSION_MODE="$2"; shift 2 ;;
    --language)       LANGUAGE="$2"; shift 2 ;;
    --brand-name)     BRAND_NAME="$2"; shift 2 ;;
    --brand-logo)     BRAND_LOGO="$2"; shift 2 ;;
    --footer-text)    FOOTER_TEXT="$2"; shift 2 ;;
    --dockerfile)     DOCKERFILE="$2"; shift 2 ;;
    --skip-docker)    SKIP_DOCKER=true; shift ;;
    --skip-wasm)      SKIP_WASM=true; shift ;;
    --help|-h)        usage ;;
    *)                error "Unknown option: $1"; echo "Run with --help for usage."; exit 1 ;;
  esac
done

# --- Validate project root ---
cd "$PROJECT_ROOT"

if [ ! -f "package.json" ] || [ ! -f "src/js/const/cdn-version.ts" ]; then
  error "This script must be run from the BentoPDF project root."
  error "Expected to find package.json and src/js/const/cdn-version.ts"
  exit 1
fi

# --- Check prerequisites ---
check_prerequisites() {
  local missing=false

  if ! command -v npm &>/dev/null; then
    error "npm is required but not found. Install Node.js first."
    missing=true
  fi

  if [ "$SKIP_DOCKER" = false ] && ! command -v docker &>/dev/null; then
    error "docker is required but not found (use --skip-docker to skip)."
    missing=true
  fi

  if [ "$missing" = true ]; then
    exit 1
  fi
}

# --- Read versions from source code ---
read_versions() {
  PYMUPDF_VERSION=$(grep "pymupdf:" src/js/const/cdn-version.ts | grep -o "'[^']*'" | tr -d "'")
  GS_VERSION=$(grep "ghostscript:" src/js/const/cdn-version.ts | grep -o "'[^']*'" | tr -d "'")
  APP_VERSION=$(node -p "require('./package.json').version")

  if [ -z "$PYMUPDF_VERSION" ] || [ -z "$GS_VERSION" ]; then
    error "Failed to read WASM versions from src/js/const/cdn-version.ts"
    exit 1
  fi
}

# --- Interactive mode ---
interactive_mode() {
  echo ""
  echo -e "${BOLD}============================================================${NC}"
  echo -e "${BOLD}  BentoPDF Air-Gapped Deployment Preparation${NC}"
  echo -e "${BOLD}  App Version: ${APP_VERSION}${NC}"
  echo -e "${BOLD}============================================================${NC}"
  echo ""
  echo "  Detected WASM versions from source:"
  echo "    PyMuPDF:      ${PYMUPDF_VERSION}"
  echo "    Ghostscript:  ${GS_VERSION}"
  echo "    CoherentPDF:  latest"
  echo ""

  # [1] WASM base URL (REQUIRED)
  echo -e "${BOLD}[1/8] WASM Base URL ${RED}(required)${NC}"
  echo "    The URL where WASM files will be hosted inside the air-gapped network."
  echo "    The script will append /pymupdf/, /gs/, /cpdf/ to this URL."
  echo ""
  echo "    Examples:"
  echo "      https://internal.example.com/wasm"
  echo "      http://192.168.1.100/assets/wasm"
  echo "      https://cdn.mycompany.local/bentopdf"
  echo ""
  while true; do
    read -r -p "    URL: " WASM_BASE_URL
    if [ -z "$WASM_BASE_URL" ]; then
      warn "WASM base URL is required. Please enter a URL."
    elif [[ ! "$WASM_BASE_URL" =~ ^https?:// ]]; then
      warn "Must start with http:// or https://. Try again."
    else
      break
    fi
  done
  echo ""

  # [2] Docker image name (optional)
  echo -e "${BOLD}[2/8] Docker Image Name ${GREEN}(optional)${NC}"
  echo "    The name used to tag the Docker image (used with 'docker run')."
  read -r -p "    Image name [${IMAGE_NAME}]: " input
  IMAGE_NAME="${input:-$IMAGE_NAME}"
  echo ""

  # [3] Simple mode (optional)
  echo -e "${BOLD}[3/8] Simple Mode ${GREEN}(optional)${NC}"
  echo "    Hides navigation, hero, features, FAQ — shows only PDF tools."
  read -r -p "    Enable Simple Mode? (y/N): " input
  if [[ "${input:-}" =~ ^[Yy]$ ]]; then
    SIMPLE_MODE="true"
  fi
  echo ""

  # [4] Default language (optional)
  echo -e "${BOLD}[4/8] Default UI Language ${GREEN}(optional)${NC}"
  echo "    Supported: en, ar, be, da, de, es, fr, id, it, nl, pt, tr, vi, zh, zh-TW"
  while true; do
    read -r -p "    Language [en]: " input
    LANGUAGE="${input:-}"
    if [ -z "$LANGUAGE" ] || echo " en ar be da de es fr id it nl pt tr vi zh zh-TW " | grep -q " $LANGUAGE "; then
      break
    fi
    warn "Invalid language code '${LANGUAGE}'. Try again."
  done
  echo ""

  # [5] Custom branding (optional)
  echo -e "${BOLD}[5/8] Custom Branding ${GREEN}(optional)${NC}"
  echo "    Replace the default BentoPDF name, logo, and footer text."
  read -r -p "    Brand name [BentoPDF]: " input
  BRAND_NAME="${input:-}"
  if [ -n "$BRAND_NAME" ]; then
    echo "    Place your logo in the public/ folder before building."
    read -r -p "    Logo path relative to public/ [images/favicon-no-bg.svg]: " input
    BRAND_LOGO="${input:-}"
    read -r -p "    Footer text [© 2026 BentoPDF. All rights reserved.]: " input
    FOOTER_TEXT="${input:-}"
  fi
  echo ""

  # [6] Base URL (optional)
  echo -e "${BOLD}[6/8] Base URL ${GREEN}(optional)${NC}"
  echo "    Set this if hosting under a subdirectory (e.g. /pdf/)."
  read -r -p "    Base URL [/]: " input
  BASE_URL="${input:-}"
  echo ""

  # [7] Dockerfile (optional)
  echo -e "${BOLD}[7/8] Dockerfile ${GREEN}(optional)${NC}"
  echo "    Options: Dockerfile (standard) or Dockerfile.nonroot (custom PUID/PGID)"
  read -r -p "    Dockerfile [${DOCKERFILE}]: " input
  DOCKERFILE="${input:-$DOCKERFILE}"
  echo ""

  # [8] Output directory (optional)
  echo -e "${BOLD}[8/8] Output Directory ${GREEN}(optional)${NC}"
  read -r -p "    Path [${OUTPUT_DIR}]: " input
  OUTPUT_DIR="${input:-$OUTPUT_DIR}"

  # Confirm
  echo ""
  echo -e "${BOLD}--- Configuration Summary ---${NC}"
  echo ""
  echo "  WASM Base URL:  ${WASM_BASE_URL}"
  echo "  Image Name:     ${IMAGE_NAME}"
  echo "  Dockerfile:     ${DOCKERFILE}"
  echo "  Simple Mode:    ${SIMPLE_MODE:-false}"
  echo "  Language:       ${LANGUAGE:-en (default)}"
  echo "  Brand Name:     ${BRAND_NAME:-BentoPDF (default)}"
  [ -n "$BRAND_NAME" ] && echo "  Brand Logo:     ${BRAND_LOGO:-images/favicon-no-bg.svg (default)}"
  [ -n "$BRAND_NAME" ] && echo "  Footer Text:    ${FOOTER_TEXT:-(default)}"
  echo "  Base URL:       ${BASE_URL:-/ (root)}"
  echo "  Output:         ${OUTPUT_DIR}"
  echo ""
  read -r -p "  Proceed? (Y/n): " input
  if [[ "${input:-Y}" =~ ^[Nn]$ ]]; then
    echo "Aborted."
    exit 0
  fi
}

# --- SHA-256 checksum (cross-platform) ---
sha256() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "n/a"
  fi
}

# --- File size (human-readable, cross-platform) ---
filesize() {
  if stat --version &>/dev/null 2>&1; then
    # GNU stat (Linux)
    stat --printf='%s' "$1" 2>/dev/null | awk '{
      if ($1 >= 1073741824) printf "%.1f GB", $1/1073741824;
      else if ($1 >= 1048576) printf "%.1f MB", $1/1048576;
      else if ($1 >= 1024) printf "%.1f KB", $1/1024;
      else printf "%d B", $1;
    }'
  else
    # BSD stat (macOS)
    stat -f '%z' "$1" 2>/dev/null | awk '{
      if ($1 >= 1073741824) printf "%.1f GB", $1/1073741824;
      else if ($1 >= 1048576) printf "%.1f MB", $1/1048576;
      else if ($1 >= 1024) printf "%.1f KB", $1/1024;
      else printf "%d B", $1;
    }'
  fi
}

# ============================================================
# MAIN
# ============================================================

check_prerequisites
read_versions

# If no WASM base URL provided, go interactive
if [ -z "$WASM_BASE_URL" ]; then
  INTERACTIVE=true
  interactive_mode
fi

# Validate language code if provided
if [ -n "$LANGUAGE" ]; then
  VALID_LANGS="en ar be da de es fr id it nl pt tr vi zh zh-TW"
  if ! echo " $VALID_LANGS " | grep -q " $LANGUAGE "; then
    error "Invalid language code: ${LANGUAGE}"
    error "Supported: ${VALID_LANGS}"
    exit 1
  fi
fi

# Validate WASM base URL format
if [[ ! "$WASM_BASE_URL" =~ ^https?:// ]]; then
  error "WASM base URL must start with http:// or https://"
  error "  Got: ${WASM_BASE_URL}"
  error "  Example: https://internal.example.com/wasm"
  exit 1
fi

# Strip trailing slash from WASM base URL
WASM_BASE_URL="${WASM_BASE_URL%/}"

# Construct WASM URLs
WASM_PYMUPDF_URL="${WASM_BASE_URL}/pymupdf/"
WASM_GS_URL="${WASM_BASE_URL}/gs/"
WASM_CPDF_URL="${WASM_BASE_URL}/cpdf/"

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  BentoPDF Air-Gapped Bundle Preparation${NC}"
echo -e "${BOLD}  App: v${APP_VERSION}  |  PyMuPDF: ${PYMUPDF_VERSION}  |  GS: ${GS_VERSION}${NC}"
echo -e "${BOLD}============================================================${NC}"

# --- Phase 1: Prepare output directory ---
step "Preparing output directory"

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

# Warn if output directory already has bundle files
if ls "$OUTPUT_DIR"/*.tgz "$OUTPUT_DIR"/bentopdf.tar "$OUTPUT_DIR"/setup.sh 2>/dev/null | head -1 &>/dev/null; then
  warn "Output directory already contains files from a previous run."
  warn "Existing files will be overwritten."
  if [ "$INTERACTIVE" = true ]; then
    read -r -p "  Continue? (Y/n): " input
    if [[ "${input:-Y}" =~ ^[Nn]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  fi
fi

info "Output: ${OUTPUT_DIR}"

# --- Phase 2: Download WASM packages ---
if [ "$SKIP_WASM" = true ]; then
  step "Skipping WASM download (--skip-wasm)"
  # Verify each file exists with specific errors
  wasm_missing=false
  if ! ls "$OUTPUT_DIR"/bentopdf-pymupdf-wasm-*.tgz &>/dev/null; then
    error "Missing: bentopdf-pymupdf-wasm-*.tgz"
    wasm_missing=true
  fi
  if ! ls "$OUTPUT_DIR"/bentopdf-gs-wasm-*.tgz &>/dev/null; then
    error "Missing: bentopdf-gs-wasm-*.tgz"
    wasm_missing=true
  fi
  if ! ls "$OUTPUT_DIR"/coherentpdf-*.tgz &>/dev/null; then
    error "Missing: coherentpdf-*.tgz"
    wasm_missing=true
  fi
  if [ "$wasm_missing" = true ]; then
    error "Run without --skip-wasm first to download the packages."
    exit 1
  fi
  success "Reusing existing WASM packages"
else
  step "Downloading WASM packages"

  WASM_TMP=$(mktemp -d)
  trap 'rm -rf "$WASM_TMP"' EXIT

  info "Downloading @bentopdf/pymupdf-wasm@${PYMUPDF_VERSION}..."
  if ! (cd "$WASM_TMP" && npm pack "@bentopdf/pymupdf-wasm@${PYMUPDF_VERSION}" --quiet 2>&1); then
    error "Failed to download @bentopdf/pymupdf-wasm@${PYMUPDF_VERSION}"
    error "Check your internet connection and that the package exists on npm."
    exit 1
  fi

  info "Downloading @bentopdf/gs-wasm@${GS_VERSION}..."
  if ! (cd "$WASM_TMP" && npm pack "@bentopdf/gs-wasm@${GS_VERSION}" --quiet 2>&1); then
    error "Failed to download @bentopdf/gs-wasm@${GS_VERSION}"
    error "Check your internet connection and that the package exists on npm."
    exit 1
  fi

  info "Downloading coherentpdf..."
  if ! (cd "$WASM_TMP" && npm pack coherentpdf --quiet 2>&1); then
    error "Failed to download coherentpdf"
    error "Check your internet connection and that the package exists on npm."
    exit 1
  fi

  # Move to output directory
  mv "$WASM_TMP"/*.tgz "$OUTPUT_DIR/"
  rm -rf "$WASM_TMP"
  trap - EXIT

  # Resolve CoherentPDF version from filename
  CPDF_TGZ=$(ls "$OUTPUT_DIR"/coherentpdf-*.tgz 2>/dev/null | head -1)
  CPDF_VERSION=$(basename "$CPDF_TGZ" | sed 's/coherentpdf-\(.*\)\.tgz/\1/')

  success "Downloaded all WASM packages"
  info "  PyMuPDF:      $(filesize "$OUTPUT_DIR"/bentopdf-pymupdf-wasm-*.tgz)"
  info "  Ghostscript:  $(filesize "$OUTPUT_DIR"/bentopdf-gs-wasm-*.tgz)"
  info "  CoherentPDF:  $(filesize "$CPDF_TGZ") (v${CPDF_VERSION})"
fi

# Resolve CPDF version if we skipped download
if [ -z "${CPDF_VERSION:-}" ]; then
  CPDF_TGZ=$(ls "$OUTPUT_DIR"/coherentpdf-*.tgz 2>/dev/null | head -1)
  CPDF_VERSION=$(basename "$CPDF_TGZ" | sed 's/coherentpdf-\(.*\)\.tgz/\1/')
fi

# --- Phase 3: Build Docker image ---
if [ "$SKIP_DOCKER" = true ]; then
  step "Skipping Docker build (--skip-docker)"

  # Check if image exists or tar exists
  if [ -f "$OUTPUT_DIR/bentopdf.tar" ]; then
    success "Reusing existing bentopdf.tar"
  elif docker image inspect "$IMAGE_NAME" &>/dev/null; then
    step "Exporting existing Docker image"
    docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/bentopdf.tar"
    success "Exported: $(filesize "$OUTPUT_DIR/bentopdf.tar")"
  else
    warn "No Docker image '${IMAGE_NAME}' found and no bentopdf.tar in output."
    warn "The bundle will not include a Docker image."
  fi
else
  step "Building Docker image"

  # Verify Dockerfile exists
  if [ ! -f "$DOCKERFILE" ]; then
    error "Dockerfile not found: ${DOCKERFILE}"
    error "Available Dockerfiles:"
    ls -1 Dockerfile* 2>/dev/null | sed 's/^/  /' || echo "  (none found)"
    exit 1
  fi

  # Verify Docker daemon is running
  if ! docker info &>/dev/null; then
    error "Docker daemon is not running. Start Docker and try again."
    exit 1
  fi

  # Build the docker build command
  BUILD_ARGS=()
  BUILD_ARGS+=(--build-arg "VITE_WASM_PYMUPDF_URL=${WASM_PYMUPDF_URL}")
  BUILD_ARGS+=(--build-arg "VITE_WASM_GS_URL=${WASM_GS_URL}")
  BUILD_ARGS+=(--build-arg "VITE_WASM_CPDF_URL=${WASM_CPDF_URL}")

  [ -n "$SIMPLE_MODE" ]       && BUILD_ARGS+=(--build-arg "SIMPLE_MODE=${SIMPLE_MODE}")
  [ -n "$BASE_URL" ]          && BUILD_ARGS+=(--build-arg "BASE_URL=${BASE_URL}")
  [ -n "$COMPRESSION_MODE" ]  && BUILD_ARGS+=(--build-arg "COMPRESSION_MODE=${COMPRESSION_MODE}")
  [ -n "$LANGUAGE" ]          && BUILD_ARGS+=(--build-arg "VITE_DEFAULT_LANGUAGE=${LANGUAGE}")
  [ -n "$BRAND_NAME" ]        && BUILD_ARGS+=(--build-arg "VITE_BRAND_NAME=${BRAND_NAME}")
  [ -n "$BRAND_LOGO" ]        && BUILD_ARGS+=(--build-arg "VITE_BRAND_LOGO=${BRAND_LOGO}")
  [ -n "$FOOTER_TEXT" ]        && BUILD_ARGS+=(--build-arg "VITE_FOOTER_TEXT=${FOOTER_TEXT}")

  info "Image name: ${IMAGE_NAME}"
  info "Dockerfile: ${DOCKERFILE}"
  info "WASM URLs:"
  info "  PyMuPDF:     ${WASM_PYMUPDF_URL}"
  info "  Ghostscript: ${WASM_GS_URL}"
  info "  CoherentPDF: ${WASM_CPDF_URL}"
  echo ""
  info "Building... this may take a few minutes (npm install + Vite build)."
  echo ""

  docker build -f "$DOCKERFILE" "${BUILD_ARGS[@]}" -t "$IMAGE_NAME" .

  success "Docker image '${IMAGE_NAME}' built successfully"

  # --- Phase 4: Export Docker image ---
  step "Exporting Docker image"

  docker save "$IMAGE_NAME" -o "$OUTPUT_DIR/bentopdf.tar"
  success "Exported: $(filesize "$OUTPUT_DIR/bentopdf.tar")"
fi

# --- Phase 5: Generate setup.sh ---
step "Generating setup script"

cat > "$OUTPUT_DIR/setup.sh" <<SETUP_EOF
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# BentoPDF Air-Gapped Setup Script
# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# BentoPDF v${APP_VERSION}
# ============================================================
# Transfer this entire directory to the air-gapped network,
# then run this script.
# ============================================================

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

# --- Check prerequisites ---
if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is required but not found."
  echo "Install Docker first: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running. Start Docker and try again."
  exit 1
fi

# --- Configuration (baked in at generation time) ---
IMAGE_NAME="${IMAGE_NAME}"
WASM_BASE_URL="${WASM_BASE_URL}"
DOCKER_PORT="\${1:-3000}"

# Where to extract WASM files (override with WASM_EXTRACT_DIR env var)
WASM_DIR="\${WASM_EXTRACT_DIR:-\${SCRIPT_DIR}/wasm}"

echo ""
echo "============================================================"
echo "  BentoPDF Air-Gapped Setup"
echo "  Version: ${APP_VERSION}"
echo "============================================================"
echo ""
echo "  Docker image:  \${IMAGE_NAME}"
echo "  WASM base URL: \${WASM_BASE_URL}"
echo "  WASM extract:  \${WASM_DIR}"
echo "  Port:          \${DOCKER_PORT}"
echo ""

# --- Step 1: Load Docker Image ---
echo "[1/3] Loading Docker image..."
if [ -f "\${SCRIPT_DIR}/bentopdf.tar" ]; then
  docker load -i "\${SCRIPT_DIR}/bentopdf.tar"
  echo "  Docker image '\${IMAGE_NAME}' loaded."
else
  echo "  WARNING: bentopdf.tar not found. Skipping Docker load."
  echo "  Make sure the image '\${IMAGE_NAME}' is already available."
fi

# --- Step 2: Extract WASM Packages ---
echo ""
echo "[2/3] Extracting WASM packages to \${WASM_DIR}..."

mkdir -p "\${WASM_DIR}/pymupdf" "\${WASM_DIR}/gs" "\${WASM_DIR}/cpdf"

# PyMuPDF: package has dist/ and assets/ at root
echo "  Extracting PyMuPDF..."
tar xzf "\${SCRIPT_DIR}"/bentopdf-pymupdf-wasm-*.tgz -C "\${WASM_DIR}/pymupdf" --strip-components=1

# Ghostscript: browser expects gs.js and gs.wasm at root
echo "  Extracting Ghostscript..."
TEMP_GS="\$(mktemp -d)"
tar xzf "\${SCRIPT_DIR}"/bentopdf-gs-wasm-*.tgz -C "\${TEMP_GS}"
if [ -d "\${TEMP_GS}/package/assets" ]; then
  cp -r "\${TEMP_GS}/package/assets/"* "\${WASM_DIR}/gs/"
else
  cp -r "\${TEMP_GS}/package/"* "\${WASM_DIR}/gs/"
fi
rm -rf "\${TEMP_GS}"

# CoherentPDF: browser expects coherentpdf.browser.min.js at root
echo "  Extracting CoherentPDF..."
TEMP_CPDF="\$(mktemp -d)"
tar xzf "\${SCRIPT_DIR}"/coherentpdf-*.tgz -C "\${TEMP_CPDF}"
if [ -d "\${TEMP_CPDF}/package/dist" ]; then
  cp -r "\${TEMP_CPDF}/package/dist/"* "\${WASM_DIR}/cpdf/"
else
  cp -r "\${TEMP_CPDF}/package/"* "\${WASM_DIR}/cpdf/"
fi
rm -rf "\${TEMP_CPDF}"

echo "  WASM files extracted to: \${WASM_DIR}"
echo ""
echo "  IMPORTANT: Ensure these paths are served by your internal web server:"
echo "    \${WASM_BASE_URL}/pymupdf/  ->  \${WASM_DIR}/pymupdf/"
echo "    \${WASM_BASE_URL}/gs/       ->  \${WASM_DIR}/gs/"
echo "    \${WASM_BASE_URL}/cpdf/     ->  \${WASM_DIR}/cpdf/"

# --- Step 3: Start BentoPDF ---
echo ""
echo "[3/3] Ready to start BentoPDF"
echo ""
echo "  To start manually:"
echo "    docker run -d --name bentopdf -p \${DOCKER_PORT}:8080 --restart unless-stopped \${IMAGE_NAME}"
echo ""
echo "  Then open: http://localhost:\${DOCKER_PORT}"
echo ""

read -r -p "Start BentoPDF now? (y/N): " REPLY
if [[ "\${REPLY:-}" =~ ^[Yy]$ ]]; then
  docker run -d --name bentopdf -p "\${DOCKER_PORT}:8080" --restart unless-stopped "\${IMAGE_NAME}"
  echo ""
  echo "  BentoPDF is running at http://localhost:\${DOCKER_PORT}"
fi
SETUP_EOF

chmod +x "$OUTPUT_DIR/setup.sh"
success "Generated setup.sh"

# --- Phase 6: Generate README ---
step "Generating README"

cat > "$OUTPUT_DIR/README.md" <<README_EOF
# BentoPDF Air-Gapped Deployment Bundle

**BentoPDF v${APP_VERSION}** | Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Contents

| File | Description |
| --- | --- |
| \`bentopdf.tar\` | Docker image |
| \`bentopdf-pymupdf-wasm-${PYMUPDF_VERSION}.tgz\` | PyMuPDF WASM module |
| \`bentopdf-gs-wasm-${GS_VERSION}.tgz\` | Ghostscript WASM module |
| \`coherentpdf-${CPDF_VERSION}.tgz\` | CoherentPDF WASM module |
| \`setup.sh\` | Automated setup script |
| \`README.md\` | This file |

## WASM Configuration

The Docker image was built with these WASM URLs:

- **PyMuPDF:** \`${WASM_PYMUPDF_URL}\`
- **Ghostscript:** \`${WASM_GS_URL}\`
- **CoherentPDF:** \`${WASM_CPDF_URL}\`

These URLs are baked into the app at build time. The user's browser fetches
WASM files from these URLs at runtime.

## Quick Setup

Transfer this entire directory to the air-gapped network, then:

\`\`\`bash
bash setup.sh
\`\`\`

The setup script will:
1. Load the Docker image
2. Extract WASM packages to \`./wasm/\` (override with \`WASM_EXTRACT_DIR\`)
3. Optionally start the BentoPDF container

## Manual Setup

### 1. Load the Docker image

\`\`\`bash
docker load -i bentopdf.tar
\`\`\`

### 2. Extract WASM packages

Extract to your internal web server's document root:

\`\`\`bash
mkdir -p ./wasm/pymupdf ./wasm/gs ./wasm/cpdf

# PyMuPDF
tar xzf bentopdf-pymupdf-wasm-${PYMUPDF_VERSION}.tgz -C ./wasm/pymupdf --strip-components=1

# Ghostscript (extract assets/ to root)
TEMP_GS=\$(mktemp -d)
tar xzf bentopdf-gs-wasm-${GS_VERSION}.tgz -C \$TEMP_GS
cp -r \$TEMP_GS/package/assets/* ./wasm/gs/
rm -rf \$TEMP_GS

# CoherentPDF (extract dist/ to root)
TEMP_CPDF=\$(mktemp -d)
tar xzf coherentpdf-${CPDF_VERSION}.tgz -C \$TEMP_CPDF
cp -r \$TEMP_CPDF/package/dist/* ./wasm/cpdf/
rm -rf \$TEMP_CPDF
\`\`\`

### 3. Configure your web server

Ensure these paths are accessible at the configured URLs:

| URL | Serves From |
| --- | --- |
| \`${WASM_PYMUPDF_URL}\` | \`./wasm/pymupdf/\` |
| \`${WASM_GS_URL}\` | \`./wasm/gs/\` |
| \`${WASM_CPDF_URL}\` | \`./wasm/cpdf/\` |

### 4. Run BentoPDF

\`\`\`bash
docker run -d --name bentopdf -p 3000:8080 --restart unless-stopped ${IMAGE_NAME}
\`\`\`

Open: http://localhost:3000
README_EOF

success "Generated README.md"

# --- Phase 7: Summary ---
step "Bundle complete"

echo ""
echo -e "${BOLD}  Output: ${OUTPUT_DIR}${NC}"
echo ""
echo "  Files:"
for f in "$OUTPUT_DIR"/*; do
  fname=$(basename "$f")
  fsize=$(filesize "$f")
  echo "    ${fname}  (${fsize})"
done

echo ""
echo -e "${BOLD}  Next steps:${NC}"
echo "    1. Transfer the '$(basename "$OUTPUT_DIR")' directory to the air-gapped network"
echo "    2. Run: bash setup.sh"
echo "    3. Configure your internal web server to serve the WASM files"
echo ""
success "Done!"
