{
  description = "yanpla website - Astro + Bun";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      # NixOS module for running the website as a service
      nixosModule =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        with lib;
        let
          cfg = config.services.yanpla-website;
        in
        {
          options.services.yanpla-website = {
            enable = mkEnableOption "yanpla website";

            package = mkOption {
              type = types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The yanpla website package to use";
            };

            port = mkOption {
              type = types.port;
              default = 4321;
              description = "Port to listen on";
            };

            host = mkOption {
              type = types.str;
              default = "0.0.0.0";
              description = "Host to bind to";
            };

            githubTokenFile = mkOption {
              type = types.nullOr types.path;
              default = null;
              description = "Path to file containing GITHUB_TOKEN (use sops-nix to manage this)";
            };

            openFirewall = mkOption {
              type = types.bool;
              default = false;
              description = "Open the firewall for the website port";
            };
          };

          config = mkIf cfg.enable {
            networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];

            systemd.services.yanpla-website =
              let
                # Create a wrapper script that loads secrets and runs the server
                startScript = pkgs.writeShellScriptBin "yanpla-website-start" ''
                  ${optionalString (cfg.githubTokenFile != null) ''
                    export GITHUB_TOKEN=$(cat "${cfg.githubTokenFile}")
                  ''}
                  exec ${pkgs.bun}/bin/bun ${cfg.package}/server/entry.mjs
                '';
              in
              {
                description = "yanpla personal website";
                wantedBy = [ "multi-user.target" ];
                after = [ "network.target" ];

                serviceConfig = {
                  Type = "simple";
                  ExecStart = "${startScript}/bin/yanpla-website-start";
                  Restart = "on-failure";
                  RestartSec = 5;

                  # Environment variables
                  Environment = [
                    "PORT=${toString cfg.port}"
                    "HOST=${cfg.host}"
                  ];

                  # Basic security
                  DynamicUser = true;
                  WorkingDirectory = cfg.package;
                };
              };
          };
        };
    in
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
          ];

          shellHook = ''
            echo "🚀 yanpla website dev shell"
            echo "bun install  - Install dependencies"
            echo "bun run dev  - Start dev server"
            echo "bun run build - Build for production"
          '';
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "yanpla-website";
          version = "0.0.1";
          src = ./.;

          nativeBuildInputs = with pkgs; [
            bun
          ];

          buildPhase = ''
            export HOME=$(mktemp -d)
            bun install --frozen-lockfile
            bun run build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';

          meta = with pkgs.lib; {
            description = "yanpla personal website built with Astro";
            homepage = "https://yanpla.com";
            license = licenses.mit;
            platforms = platforms.all;
          };
        };
      }
    )
    // {
      # Export the NixOS module
      nixosModules.default = nixosModule;
    };
}
