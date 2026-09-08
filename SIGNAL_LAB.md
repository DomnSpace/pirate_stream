# Pirate Radio Signal Lab v1

Signal Lab treats one locally loaded mother track as an immutable source and saves **pointers**, not destructively chopped audio.

## Phone-first interaction

- tap waveform: move playhead
- drag A/B handles: trim pointer
- drag selected region: move it without changing duration
- pinch waveform: zoom around the gesture center
- double tap waveform: toggle loop audition
- beat buttons: step by the current BPM grid
- snap modes: free, beat, 1/16, detected transient
- source views: raw, attack projection, tail projection, grain projection

The first release intentionally has no desktop-only interaction requirement.

## Local audio

Audio is selected with the browser file picker and decoded through Web Audio. The source file stays on the device and is not uploaded by Signal Lab. M4A, MP3, WAV, OGG and other browser-decodable audio formats are accepted.

The Dr. Corrosion mother track is therefore a test/source object, not a repository asset.

## Pointer map

```json
{
  "version": "pirate-radio-signal-map-v1",
  "source": {
    "id": "local:file-name:size:last-modified",
    "file_name": "mother-track.m4a",
    "duration": 402.76
  },
  "tempo": {"bpm": 174, "grid": "1/16"},
  "pointers": [
    {
      "id": "ptr_001",
      "source": "local:file-name:size:last-modified",
      "file_name": "mother-track.m4a",
      "start": 18.421,
      "end": 19.863,
      "duration": 1.442,
      "view": "raw",
      "bpm": 174,
      "snap": "transient",
      "tags": ["COIL", "HOME", "GESTURE"],
      "parent": "SOURCE"
    }
  ]
}
```

A later derived pointer may refer to another pointer as its parent rather than duplicating samples. Runtime baking into WAV/sample banks is a separate operation and must preserve this genealogy.

## Initial vocabulary

Roles: `HOME`, `COIL`, `ROUTINE`, `GREEN`, `MEASURE`, `CORRECT`, `FAULT`, `RUPTURE`, `ARCHITECTURE`, `RETURN`, `SHUTDOWN`.

Material/scale tags: `BODY`, `CRACK`, `LATTICE`, `LIQUID`, `FULL_BAND`, `GRAIN`, `ATTACK`, `GESTURE`, `CELL`, `PHRASE`, `SECTION`.

## Boundary

Signal Lab currently lives in Pirate Radio because local audio, Web Audio and touch gestures are browser-native. DVX remains generic. Once the interaction is proven, the same pointer contract can be consumed by a DVX-hosted tool or Dr. Corrosion without changing the source-map format.
