{
  description = "Raypx development environment (Bun 1.4.3 and Node 24.15.0)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      releases = {
        aarch64-darwin = {
          bunPlatform = "darwin-aarch64";
          bunHash = "sha512-u2wAM9RzqyF4baO5oFVhcFUVWO1CCMLG6yC5/aPWCYGZPfL5ULMbeHt+0/3I0h3yaPx1m+PKSANO/61jPtDZcQ==";
          nodePlatform = "darwin-arm64";
          nodeHash = "sha256-r1z66v5gOq91mfKH/Z0QC7QfFnlPSXiPpZ3T8lVGkw8=";
        };
        x86_64-darwin = {
          bunPlatform = "darwin-x64";
          bunHash = "sha512-wRGeciWOyKyG/BfTHq4CAyqoOfuzj5UJkKA8FlJETW2yhtDh+Ba3EgPnsVclFyzIw7E0HJxpsonoj17g3HPK/Q==";
          nodePlatform = "darwin-x64";
          nodeHash = "sha256-XWJyRbn1PLJRLMIbeqaq1pMQav+t2R4Mj0LWAPt7pEQ=";
        };
        aarch64-linux = {
          bunPlatform = "linux-aarch64";
          bunHash = "sha512-ylogDFxDD+aRKO0TJauwDzCWM+rULvc85gRNZQ9CnY6rm2BU4GC2XUDi20bh67CIuB4Wt/0PL1xpsJ2hqplMww==";
          nodePlatform = "linux-arm64";
          nodeHash = "sha256-89Wnl7XSEM6OLLJlVEyOSC6u3LiqQJqLRtp+hZXQ3aA=";
        };
        x86_64-linux = {
          bunPlatform = "linux-x64";
          bunHash = "sha512-RArgnpjeXjaGzjp5h7Rs89cUYJutO8IyqR3itE8OBaBzEt8KNm2jp/YozxBHq4eFovwrQLryeSwTAcmiT+zcoA==";
          nodePlatform = "linux-x64";
          nodeHash = "sha256-RyZVWB+4UVWXMMSHY+DJ07wll1xZ1RgAP8CEnT5LoPY=";
        };
      };
    in {
      devShells = nixpkgs.lib.genAttrs systems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          release = releases.${system};
          binary = { pname, version, url, hash, executable, expectedVersion }:
            pkgs.stdenv.mkDerivation {
              inherit pname version;
              src = pkgs.fetchurl { inherit url hash; };
              nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.autoPatchelfHook ];
              buildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc.cc.lib ];
              dontStrip = true;
              dontConfigure = true;
              dontBuild = true;
              installPhase = ''
                runHook preInstall
                ${if pname == "node" then ''
                  mkdir -p "$out"
                  cp -R bin lib include share "$out/"
                '' else ''
                  install -Dm755 ${executable} "$out/bin/${pname}"
                  ln -s bun "$out/bin/bunx"
                ''}
                runHook postInstall
              '';
              doInstallCheck = true;
              installCheckPhase = ''
                runHook preInstallCheck
                test "$("$out/bin/${pname}" --version)" = '${expectedVersion}'
                runHook postInstallCheck
              '';
            };
          bun = binary {
            pname = "bun";
            version = "1.4.3";
            url = "https://registry.npmjs.org/@oven/bun-${release.bunPlatform}/-/bun-${release.bunPlatform}-1.4.3.tgz";
            hash = release.bunHash;
            executable = "bin/bun";
            expectedVersion = "1.4.3";
          };
          node = binary {
            pname = "node";
            version = "24.15.0";
            url = "https://nodejs.org/dist/v24.15.0/node-v24.15.0-${release.nodePlatform}.tar.xz";
            hash = release.nodeHash;
            executable = "bin/node";
            expectedVersion = "v24.15.0";
          };
          postgresClient = pkgs.runCommand "postgresql-17-client" { } ''
            mkdir -p "$out/bin"
            for command in psql pg_dump pg_restore pg_isready createdb; do
              ln -s ${pkgs.lib.getBin pkgs.postgresql_17}/bin/$command "$out/bin/$command"
            done
          '';
        in {
          default = pkgs.mkShell {
            packages = [ bun node pkgs.git postgresClient ];
          };
        });
    };
}
