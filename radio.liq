# Liquidsoap script for Pirate Radio
radio = playlist(mode='random', '/music')
output.icecast(%mp3(bitrate=128), radio, 
  host='icecast', 
  port=8000,
  password='hackme-source',
  mount='/stream',
  name='Pirate Radio',
  genre='Chiptune')
