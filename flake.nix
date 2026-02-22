{
  description = "yanpla website";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    bun2nix.url = "github:nix-community/bun2nix?tag=2.0.8";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs = { self, nixpkgs, bun2nix }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      pkgsFor = system: import nixpkgs {
        inherit system;
        overlays = [ bun2nix.overlays.default ];
      };

      websiteDrv = system:
        let pkgs = pkgsFor system;
        in pkgs.bun2nix.mkDerivation {
          pname = "yanpla-website";
          version = "0.0.1";
          src = ./.;
          packageJson = ./package.json;
          bunDeps = pkgs.bun2nix.fetchBunDeps { bunNix = ./bun.nix; };
          buildPhase = "bun run build";
          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';
        };
    in
    {
      packages = forAllSystems (system: {
        default = websiteDrv system;
      });

      devShells = forAllSystems (system: {
        default = let pkgs = pkgsFor system;
        in pkgs.mkShell {
          packages = [ pkgs.bun pkgs.bun2nix ];
          shellHook = "bun install --frozen-lockfile";
        };
      });

      nixosModules.default = { config, lib, pkgs, ... }:
        let cfg = config.services.yanpla-website;
        in {
          options.services.yanpla-website = {
            enable = lib.mkEnableOption "yanpla website";
            port = lib.mkOption {
              type = lib.types.port;
              default = 4321;
            };
            host = lib.mkOption {
              type = lib.types.str;
              default = "0.0.0.0";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.yanpla-website = {
              description = "yanpla website";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];
              environment = {
                HOST = cfg.host;
                PORT = toString cfg.port;
                NODE_ENV = "production";
              };
              serviceConfig = {
                Type = "simple";
                Restart = "always";
                User = "yanpla-website";
                Group = "yanpla-website";
                WorkingDirectory = "${self.packages.${pkgs.system}.default}";
                ExecStart = "${pkgs.bun}/bin/bun ${self.packages.${pkgs.system}.default}/server/entry.mjs";
              };
            };

            users.users.yanpla-website = {
              isSystemUser = true;
              group = "yanpla-website";
            };
            users.groups.yanpla-website = {};
          };
        };
    };
}
