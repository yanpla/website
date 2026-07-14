{
  description = "Astro website dev environment (Vite+)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nix-vite-plus.url = "github:ryoppippi/nix-vite-plus";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      nix-vite-plus,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        vp = nix-vite-plus.packages.${system}.vp;
        node_modules = pkgs.stdenv.mkDerivation {
          pname = "website-node-modules";
          version = "0.0.1";
          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./package.json
              ./bun.lock
            ];
          };

          nativeBuildInputs = [ pkgs.bun ];

          buildPhase = ''
            export HOME=$TMPDIR
            bun install --frozen-lockfile --no-progress --ignore-scripts
          '';

          installPhase = ''
            mkdir -p $out
            cp -R node_modules $out/node_modules
          '';

          dontFixup = true;
          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          outputHash = "sha256-e/dRh4P7cSzJiDM9Olqeu6PH2QvDJ9grcQDKe0uEl+g=";
        };

        website = pkgs.stdenv.mkDerivation {
          pname = "website";
          version = "0.0.1";
          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.difference ./. (
              pkgs.lib.fileset.unions [
                (pkgs.lib.fileset.maybeMissing ./node_modules)
                (pkgs.lib.fileset.maybeMissing ./dist)
                ./flake.nix
                ./flake.lock
              ]
            );
          };

          nativeBuildInputs = [
            pkgs.bun
            pkgs.nodejs_24
            pkgs.makeWrapper
          ];

          buildPhase = ''
            export HOME=$TMPDIR
            export ASTRO_TELEMETRY_DISABLED=1
            cp -R ${node_modules}/node_modules node_modules
            chmod -R u+w node_modules
            patchShebangs node_modules
            bun run build
          '';

          installPhase = ''
            mkdir -p $out/lib/website $out/bin
            cp -R dist $out/lib/website/dist
            cp -R node_modules $out/lib/website/node_modules

            makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/website \
              --add-flags "$out/lib/website/dist/server/entry.mjs" \
              --set-default HOST 0.0.0.0 \
              --set-default PORT 4321
          '';
        };
      in
      {
        packages.default = website;

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.nodejs_24
            vp
          ];

          shellHook = ''
            # Vite+ ships its own downloaded Node runtime, which can't run on
            # NixOS. Switch vp to "system-first" mode so it uses the Node
            # provided here instead of the managed binary.
            vp env off >/dev/null 2>&1 || true
            echo "node $(node --version) · bun $(bun --version) · vp ready"
          '';
        };
      }
    );
}
