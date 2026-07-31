#!/usr/bin/env bash
# Renders every printable part to build/*.stl and the assembly preview to
# build/assembly.png. Requires the openscad CLI.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build

echo "Rendering frame.stl ..."
openscad -o build/frame.stl frame.scad

echo "Rendering toggle_slider.stl ..."
openscad -o build/toggle_slider.stl toggle_slider.scad

echo "Rendering assembly preview ..."
openscad -o build/assembly.png --imgsize=1200,800 assembly.scad || true

echo "Done. STLs in case/build/"
