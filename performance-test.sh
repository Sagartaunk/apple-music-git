# Monitor resource usage
# Run app in one terminal, then in another:

# CPU and memory usage
ps aux | grep apple-music

# Real-time monitoring with htop
htop -p $(pgrep -f apple-music)

# Check PipeWire/PulseAudio streams
pactl list sink-inputs | grep -A 20 "apple-music"