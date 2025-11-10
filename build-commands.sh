# Clone or create project directory
mkdir apple-music-electron
cd apple-music-electron

# Copy all files from this codebase into the directory

# Install dependencies
npm install

# Development mode (hot reload)
npm start

# Build AppImage for production
npm run make

# The AppImage will be in: out/make/
# Example: out/make/AppleMusic-1.0.0.AppImage