const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    executableName: 'apple-music-electron',
    name: 'AppleMusic',
    // Use @electron/packager (default in Forge 7.5+)
    prune: true,
    extraResource: [],
    appCopyright: 'Copyright © 2025 Sagartaunk',
    appCategoryType: 'public.app-category.music',
    // Linux-specific optimizations
    platform: 'linux',
    arch: 'x64',
  },
  rebuildConfig: {},
  makers: [
    // Primary: AppImage maker (latest stable 4.1.4)
    {
      name: '@reforged/maker-appimage',
      config: {
        options: {
          name: 'AppleMusic',
          productName: 'Apple Music',
          genericName: 'Music Player',
          categories: ['Audio', 'Music', 'Player', 'AudioVideo'],
          mimeType: ['x-scheme-handler/itmss', 'x-scheme-handler/musics'],
          bin: 'apple-music-electron',
          icon: path.resolve(__dirname, 'assets', 'icon.png'),
          description: 'Apple Music client with Widevine DRM for Linux',
          homepage: 'https://github.com/Sagartaunk/apple-music-electron',
        },
      },
      platforms: ['linux'],
    },
    // Secondary: DEB package (Debian/Ubuntu)
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'apple-music-electron',
          productName: 'Apple Music',
          genericName: 'Music Player',
          categories: ['Audio', 'Music', 'AudioVideo'],
          section: 'sound',
          priority: 'optional',
          icon: path.resolve(__dirname, 'assets', 'icon.png'),
          maintainer: 'Sagartaunk <sagartaunk@example.com>',
          homepage: 'https://github.com/Sagartaunk/apple-music-electron',
          description: 'Apple Music client with Widevine DRM support',
          depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils'],
        },
      },
      platforms: ['linux'],
    },
    // Tertiary: RPM package (Fedora/RHEL/Arch with rpm-tools)
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'apple-music-electron',
          productName: 'Apple Music',
          genericName: 'Music Player',
          categories: ['Audio', 'Music', 'AudioVideo'],
          icon: path.resolve(__dirname, 'assets', 'icon.png'),
          homepage: 'https://github.com/Sagartaunk/apple-music-electron',
          description: 'Apple Music client with Widevine DRM support',
          license: 'MIT',
        },
      },
      platforms: ['linux'],
    },
    // Fallback: ZIP archive (universal)
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux', 'darwin', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        // Webpack 5 optimizations
        devContentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self'",
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/controls.ts',
              name: 'main_window',
              preload: {
                js: './src/preload.ts',
              },
            },
          ],
        },
      },
    },
  ],
  // Hooks for modern build process
  hooks: {
    packageAfterPrune: async (config, buildPath) => {
      console.log('📦 Package pruned, optimizing for production...');
    },
    postMake: async (config, makeResults) => {
      console.log('✅ Build complete! Generated artifacts:');
      makeResults.forEach(result => {
        console.log(`   - ${result.platform}/${result.arch}: ${result.artifacts.length} file(s)`);
      });
    },
  },
};
