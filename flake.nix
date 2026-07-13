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
        # Vite+ downloads and runs its own Node runtime — a generic,
        # dynamically-linked binary. On NixOS that can't run directly (no
        # nix-ld), so the dev shell is an FHS environment that provides the
        # standard /lib layout those binaries expect.
        fhs = pkgs.buildFHSEnv {
          name = "vite-plus-dev";
          targetPkgs = p: [
            vp
            p.bun
            p.nodejs_24
            p.stdenv.cc.cc
            p.zlib
            p.openssl
            p.libuv
          ];
          profile = ''
            echo "vite-plus dev shell · vp $(vp --version 2>/dev/null || echo '?') · bun $(bun --version)"
          '';
          runScript = "bash";
        };
      in
      {
        devShells.default = fhs.env;
      }
    );
}
