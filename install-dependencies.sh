# Update system
sudo pacman -Syu

# Install Node.js and npm
sudo pacman -S nodejs npm

# Install Widevine CDM (required for DRM playback)
# Option 1: Install from AUR
yay -S chromium-widevine

# Option 2: Manual installation
# Download from https://dl.google.com/widevine-cdm/
# Extract libwidevinecdm.so to /usr/lib/chromium/

# Install build dependencies
sudo pacman -S base-devel git python3

# Optional: Install AppImage runtime for testing
sudo pacman -S fuse2