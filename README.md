# 🚢 Pirate Radio Stream - GitHub Pages Interface

A beautiful web interface for your local Icecast radio stream, designed to be hosted on GitHub Pages.

## 🎯 What This Does

This project provides a sleek, retro-styled web interface that connects to your local Icecast stream. Users can:
- Connect to your local radio stream from anywhere
- Control playback (play/pause/stop)
- View current track metadata
- Adjust volume
- See listener count and stream info

## 🚀 Quick Setup for GitHub Pages

### 1. Create a GitHub Repository
1. Go to GitHub and create a new repository (e.g., `pirate-stream`)
2. Make it public (required for free GitHub Pages)

### 2. Upload Your Files
```bash
# Clone your new repo
git clone https://github.com/YOUR_USERNAME/pirate-stream.git
cd pirate-stream

# Copy the index.html file to your repo
# (The index.html file is already in your c:\Users\Dominik\pirate-stream folder)

# Add and commit
git add index.html
git commit -m "Add pirate radio web interface"
git push origin main
```

### 3. Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select **Deploy from a branch**
4. Choose **main** branch and **/ (root)**
5. Click **Save**

Your site will be available at: `https://YOUR_USERNAME.github.io/pirate-stream/`

## 🎮 How to Use

### For Stream Host (You):
1. Run your local Icecast server using the radio_gui.py
2. Note the port it's using (e.g., 8000, 8001, etc.)
3. Share your GitHub Pages URL with listeners

### For Listeners:
1. Visit your GitHub Pages URL
2. Enter the stream URL: `http://YOUR_IP:PORT/stream`
   - Example: `http://192.168.1.100:8000/stream`
3. Click "Connect" then "Play"

## 🔧 Configuration

### Default Stream URL
Edit the `index.html` file and change this line:
```html
<input type="text" id="serverUrl" placeholder="http://localhost:8000/stream" value="http://YOUR_IP:8000/stream">
```

### CORS Issues
If listeners can't connect, you may need to configure CORS on your Icecast server. Add this to your `icecast.xml`:

```xml
<http-headers>
    <header name="Access-Control-Allow-Origin" value="*" />
    <header name="Access-Control-Allow-Headers" value="Origin, Accept, X-Requested-With, Content-Type" />
    <header name="Access-Control-Allow-Methods" value="GET, OPTIONS" />
</http-headers>
```

## 🎨 Customization

### Change Colors
Edit the CSS variables in `index.html`:
```css
:root {
  --bg:#050505;        /* Background */
  --accent:#0ff;       /* Primary accent (cyan) */
  --text:#eee;         /* Text color */
  --accent2:#f0f;      /* Secondary accent (magenta) */
  --error:#ff6b6b;     /* Error color */
}
```

### Update Branding
- Change the title in the `<h1>` tag
- Update the footer links
- Modify the page title in `<title>`

## 🌐 Network Access

For external access, you'll need to:
1. Use your public IP address instead of localhost
2. Configure port forwarding on your router
3. Ensure Windows Firewall allows the connection

## 📱 Features

- **Responsive Design**: Works on mobile and desktop
- **Retro Styling**: Cyberpunk/pirate theme with glowing effects
- **Persistent Settings**: Remembers your stream URL and volume
- **Real-time Metadata**: Shows current track and listener count
- **Error Handling**: Clear status messages for connection issues
- **Cross-platform**: Works in any modern web browser

## 🛠️ Technical Details

- Pure HTML/CSS/JavaScript (no build process required)
- Uses HTML5 Audio API for streaming
- localStorage for settings persistence
- Responsive CSS Grid/Flexbox layout
- Fetch API for metadata polling

## 🎵 Supported Stream Formats

- MP3 (recommended)
- AAC
- OGG (browser dependent)

---

**Built with ❤️ for the high seas** 🏴‍☠️
