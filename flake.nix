{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/8edc0c72e3a38faf5434e40d1f19431125fe4b30";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      package = builtins.fromJSON (builtins.readFile ./package.json);
      bunVersion = "1.3.14";
      playwrightVersion = "1.64.0";
      packagesFor = system:
        let
          pkgs = import nixpkgs { inherit system; };
          bun = pkgs.bun.overrideAttrs {
            version = bunVersion;
            src = pkgs.fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${if system == "x86_64-linux" then "linux-x64-baseline" else "darwin-aarch64"}.zip";
              hash = {
                x86_64-linux = "sha256-oGOQiuCLeFLKEJObvcbO7T3avOj7lALc6D1l1zs25sc=";
                aarch64-darwin = "sha256-2LliIYKK1vl6x6wKt+lYcjQa92MAHogD6CZ2UsJlJiA=";
              }.${system};
            };
          };
          webkit = pkgs.playwright-driver.components.webkit.overrideAttrs {
            src = pkgs.fetchzip {
              url = "https://cdn.playwright.dev/dbazure/download/playwright/builds/webkit/2370/webkit-ubuntu-24.04.zip";
              stripRoot = false;
              hash = "sha256-vqPJo+bzhXd0Q/to1l5/3d/xd4k+59h9tGZ+GQvWUP4=";
            };
          };
          ffmpeg = pkgs.fetchzip {
            url = "https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip";
            stripRoot = false;
            hash = "sha256-5+WbgtmcKkTaSurejqzkkglNI/0dW7ePxbltOeCiakI=";
          };
        in
        assert package.packageManager == "bun@${bunVersion}";
        assert package.devDependencies."@playwright/test" == "^${playwrightVersion}";
        assert builtins.match ".*\"@playwright/test@1\\.64\\.0\".*" (builtins.readFile ./bun.lock) != null;
        { inherit bun; } // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          playwright-browsers = pkgs.linkFarm "playwright-${playwrightVersion}-browsers" {
            webkit-2370 = webkit;
            ffmpeg-1013 = ffmpeg;
          };
        };
    in
    {
      packages = forAllSystems packagesFor;
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          packages = packagesFor system;
        in
        {
          default = pkgs.mkShell ({
            packages = [ packages.bun pkgs.nodejs ];
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          } // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            PLAYWRIGHT_BROWSERS_PATH = "${packages.playwright-browsers}";
            PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
          });
        });
    };
}
