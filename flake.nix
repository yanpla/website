{
  description = "Astro website dev environment";

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
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.nodejs_24
            vp
          ];

          shellHook = ''
            echo "bun $(bun --version) · node $(node --version) · vite-plus $(vp --version 2>/dev/null || echo '?')"
          '';
        };
      }
    );
}
