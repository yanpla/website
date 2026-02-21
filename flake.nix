{
  description = "yanpla's personal website";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      bun2nix,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "yanpla-website";
          version = "0.0.1";
          src = ./.;

          nativeBuildInputs = [
            pkgs.bun
            bun2nix.packages.${system}.default
          ];

          configurePhase = ''
            bun2nix install --bun-nix ./bun.nix --node-modules-dir ./node_modules
          '';

          buildPhase = ''
            export HOME=$(mktemp -d)
            bun run build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';
        };

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            bun2nix.packages.${system}.default
          ];
          shellHook = ''
            echo "🚀 yanpla website dev shell"
            echo "bun run dev   - start dev server"
            echo "bun2nix       - regenerate bun.nix after updating deps"
          '';
        };
      }
    );
}
