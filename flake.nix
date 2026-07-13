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
      in
      {
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
