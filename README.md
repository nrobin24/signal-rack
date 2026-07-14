# Signal Rack

An early-stage Electron MIDI sequencer built around device-specific rack units.

The first rack unit controls a Digitone bass track and chord/stab track. The app currently provides a 16-step sequence, selectable MIDI output and channels, BPM, transport, MIDI clock, and octave transpose controls.

## Run it

```bash
npm install
npm run dev
```

Select the Digitone's MIDI output in the upper-right control, choose the T1/T2 channels, then press Play. Configure the Digitone's track MIDI channels to match. The defaults (9 and 10) leave channels 1–8 free for a Digitakt's audio tracks.
