"""Render public-domain hymn melodies as gentle, original instrumental demos."""
import math, wave, struct, pathlib, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
# Diatonic notes; duration in beats. Traditional melodies in the public domain.
songs={
'amazing-grace': [('G4',1),('C5',2),('E5',.5),('C5',.5),('E5',2),('D5',1),('C5',2),('A4',1),('G4',2),('G4',1),('C5',2),('E5',.5),('C5',.5),('E5',2),('D5',1),('G5',3),('G5',2),('E5',1),('G5',2),('E5',.5),('C5',.5),('E5',2),('D5',1),('C5',2),('A4',1),('G4',2),('G4',1),('C5',2),('E5',.5),('C5',.5),('E5',2),('D5',1),('C5',3)],
'be-thou-my-vision': [('C5',1),('C5',1),('D5',1),('E5',1),('D5',1),('E5',1),('G5',2),('E5',1),('D5',2),('C5',1),('C5',1),('A4',1),('G4',1),('A4',1),('C5',1),('C5',3),('E5',1),('E5',1),('E5',1),('G5',1),('A5',1),('G5',1),('E5',2),('D5',1),('G5',1),('E5',1),('C5',1),('D5',1),('E5',1),('D5',1),('C5',3)],
'doxology': [('G4',1),('G4',1),('F4',1),('E4',1),('D4',1),('G4',1),('A4',1),('B4',1),('C5',2),('C5',1),('C5',1),('B4',1),('A4',1),('G4',1),('C5',1),('B4',1),('A4',1),('G4',2),('G4',1),('A4',1),('B4',1),('C5',1),('A4',1),('G4',1),('E4',1),('F4',1),('G4',2),('C5',1),('B4',1),('A4',1),('G4',1),('C5',1),('D5',1),('B4',1),('C5',3)]}
def frequency(note):
 semitones={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
 return 440*2**(((int(note[-1])+1)*12+semitones[note[0]]-69)/12)
for name,melody in songs.items():
 rate=22050;beat=.65;total=sum(b for _,b in melody)*beat*2+3
 signal=[0.] * int(total*rate);pos=0.
 for repeat in range(2):
  for note,beats in melody:
   f=frequency(note);length=beats*beat
   for j in range(int((length+1.2)*rate)):
    t=j/rate;idx=int(pos*rate)+j
    if idx>=len(signal):break
    env=min(1,t/.012)*math.exp(-t*3/max(.7,length))
    value=(math.sin(2*math.pi*f*t)+.3*math.sin(2*math.pi*2*f*t)*math.exp(-t*3)+.12*math.sin(2*math.pi*3*f*t)*math.exp(-t*5))*.22*env
    value+=.07*math.sin(2*math.pi*f/2*t)*env
    signal[idx]+=value
   pos+=length
 with tempfile.TemporaryDirectory() as tmp:
  p=pathlib.Path(tmp)/'hymn.wav'
  with wave.open(str(p),'wb') as w:
   w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
   w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x))*26000)) for x in signal))
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(p),'-codec:a','libmp3lame','-b:a','128k',str(ROOT/'apps/app/assets/audio'/f'{name}.mp3')],check=True)
 print(name,round(total), 'seconds')
