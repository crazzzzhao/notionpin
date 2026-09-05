#!/bin/zsh

set -euo pipefail

script_directory="${0:A:h}"
project_directory="${script_directory:h}"
source_svg="${project_directory}/build/icon.svg"
output_png="${project_directory}/build/icon.png"
output_icns="${project_directory}/build/icon.icns"
temporary_directory="$(mktemp -d /tmp/nopin-icon.XXXXXX)"
iconset_directory="${temporary_directory}/Nopin.iconset"
rendered_png="${temporary_directory}/icon.png"
rendered_icns="${temporary_directory}/icon.icns"
mkdir "${iconset_directory}"

cleanup() {
  if [[ -d "${temporary_directory}" ]]; then
    find "${temporary_directory}" -depth -delete
  fi
}
trap cleanup EXIT

"${project_directory}/node_modules/.bin/electron" \
  "${script_directory}/render-macos-icon.mjs" "${source_svg}" "${rendered_png}"

sips -z 16 16 "${rendered_png}" --out "${iconset_directory}/icon_16x16.png" >/dev/null
sips -z 32 32 "${rendered_png}" --out "${iconset_directory}/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "${rendered_png}" --out "${iconset_directory}/icon_32x32.png" >/dev/null
sips -z 64 64 "${rendered_png}" --out "${iconset_directory}/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "${rendered_png}" --out "${iconset_directory}/icon_128x128.png" >/dev/null
sips -z 256 256 "${rendered_png}" --out "${iconset_directory}/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "${rendered_png}" --out "${iconset_directory}/icon_256x256.png" >/dev/null
sips -z 512 512 "${rendered_png}" --out "${iconset_directory}/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "${rendered_png}" --out "${iconset_directory}/icon_512x512.png" >/dev/null
cp "${rendered_png}" "${iconset_directory}/icon_512x512@2x.png"

iconutil -c icns "${iconset_directory}" -o "${rendered_icns}"
cp "${rendered_png}" "${output_png}"
cp "${rendered_icns}" "${output_icns}"

echo "Generated ${output_png} and ${output_icns}"
