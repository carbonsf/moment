// Tide water styles. Shared uniforms: L level, HT height-field (hh), P.x ambient wave amp, P.y breath lift, Q.x dim.
var TIDE_PRE = `
float amb(float x){return (sin(x*7.+T*.9)*.6+sin(x*13.-T*1.3)*.3+sin(x*3.1+T*.4))*.004*P.x*(.6+B);}
float base(float x){return 1.-L-hh(x)+amb(x)-.018*B*P.y;}
`;

MomentGL.add('glass', TIDE_PRE + `
void main(){vec2 uv=vec2(gl_FragCoord.x/R.x,1.-gl_FragCoord.y/R.y);float ar=R.x/R.y;
float sy=base(uv.x);float sl=(base(uv.x+.012)-base(uv.x-.012))/.024;
float dp=uv.y-sy;
vec3 c=mix(vec3(.09,.095,.105),vec3(.055,.06,.068),uv.y);
c+=(fbm(vec2(uv.x*3.,uv.y*2.-T*.02))-.5)*.03;
if(dp>0.){
 vec2 ruv=uv+vec2(sl*.06*exp(-dp*3.),0.);
 vec3 wc=mix(vec3(.10,.27,.30),vec3(.015,.04,.055),clamp(dp*2.,0.,1.));
 vec2 cp=vec2(ruv.x*ar,ruv.y)*5.;
 float k1=fbm(cp+vec2(T*.08,T*.05));float cs=pow(1.-abs(sin(k1*11.)),7.);
 wc+=TEAL*cs*.3*exp(-dp*2.5);
 float ry=fbm(vec2(ruv.x*7.+ruv.y*1.8,T*.04));wc+=TEAL*.1*pow(ry,3.)*exp(-dp*1.5);
 wc+=TEAL*.14*exp(-dp*36.)*(1.+abs(sl)*3.);
 wc*=1.-Q.x;c=wc;}
float lit=.45+min(abs(sl)*2.5,1.2);
c+=INK*lit*exp(-abs(dp)*R.y*.3)+TEAL*.25*exp(-abs(dp)*45.);
if(dp<0.)c+=TEAL*.05*exp(dp*12.);
c*=1.-.3*length(uv-.5);
gl_FragColor=vec4(c,1.);}
`);

MomentGL.add('storm', TIDE_PRE + `
float chop(float x,float k){return ((fbm(vec2(x*9.,T*.7))-.5)*.034+(ns(vec2(x*26.,T*1.7))-.5)*.012)*k;}
float sf(float x,float k){return base(x)-chop(x,k);}
void main(){vec2 uv=vec2(gl_FragCoord.x/R.x,1.-gl_FragCoord.y/R.y);float ar=R.x/R.y;
float k=.35+L*1.5;
float sy=sf(uv.x,k);float sl=(sf(uv.x+.008,k)-sf(uv.x-.008,k))/.016;
float dp=uv.y-sy;
vec3 c=mix(vec3(.075,.085,.095),vec3(.04,.045,.055),uv.y);
c+=(fbm(vec2(uv.x*2.+T*.03,uv.y*3.))-.5)*.05;
if(dp>0.){
 vec2 p=vec2(uv.x*ar,uv.y)*2.5;
 vec2 q=vec2(fbm(p+vec2(T*.12,0.)),fbm(p+vec2(5.2,-T*.15)));
 float tu=fbm(p*1.4+q*2.6+vec2(0.,-T*.25));
 vec3 wc=mix(vec3(.03,.16,.17),vec3(.10,.30,.31),tu);
 wc=mix(wc,vec3(.01,.03,.04),clamp(dp*1.7,0.,1.));
 vec2 cp=vec2(uv.x*ar,uv.y)*6.+q*2.;
 float cs=pow(1.-abs(sin(fbm(cp+T*.2)*13.)),12.);
 wc+=INK*cs*.22*exp(-dp*3.);
 float ry=fbm(vec2((uv.x+uv.y*.45)*10.,T*.18));wc+=TEAL*.22*pow(ry,4.)*exp(-dp*1.2);
 vec2 sg=vec2(uv.x*ar*70.,uv.y*18.+T*1.8);float sh=h21(floor(sg));
 wc+=INK*.18*step(.985,sh)*smoothstep(.5,.0,abs(fract(sg.y)-.5))*exp(-dp*2.);
 wc+=INK*.12*exp(-dp*30.)*(1.+abs(sl)*2.);
 float fo=smoothstep(.5,.78,fbm(vec2(uv.x*16.+T*.3,dp*55.-T*.6)))*exp(-dp*28.)*(.4+min(abs(sl)*3.,1.));
 wc=mix(wc,INK*.85,fo*.7*k);
 wc*=1.-Q.x;c=wc;}
else{
 vec2 g=vec2(uv.x*ar*90.,uv.y*60.+T*6.);vec2 id=floor(g);float hs=h21(id);
 float dt=step(.965,hs)*smoothstep(.45,.1,length(fract(g)-.5));
 c+=INK*dt*.7*exp(dp*30.)*k;
 c+=INK*.06*exp(dp*60.)*k;}
c+=INK*(.4+min(abs(sl)*3.,1.4))*exp(-abs(dp)*R.y*.28)+TEAL*.3*exp(-abs(dp)*40.);
c*=1.-.32*length(uv-.5);
gl_FragColor=vec4(c,1.);}
`);

MomentGL.add('boil', TIDE_PRE + `
float bl(float x,float k){return (pow(ns(vec2(x*22.,T*2.2)),3.)*.014+pow(ns(vec2(x*8.,T*1.2)),4.)*.022)*k;}
float sf(float x,float k){return base(x)-bl(x,k);}
void main(){vec2 uv=vec2(gl_FragCoord.x/R.x,1.-gl_FragCoord.y/R.y);float ar=R.x/R.y;
float k=.3+L*1.4;
float sy=sf(uv.x,k);float sl=(sf(uv.x+.008,k)-sf(uv.x-.008,k))/.016;
float dp=uv.y-sy;
vec3 c=mix(vec3(.085,.085,.09),vec3(.05,.05,.058),uv.y);
if(dp>0.){
 vec2 p=vec2(uv.x*ar,uv.y);
 float pl=fbm(vec2(p.x*4.+fbm(p*3.+T*.1)*1.5,p.y*2.5+T*.4));
 vec3 wc=mix(vec3(.12,.25,.26),vec3(.025,.045,.055),clamp(dp*1.8,0.,1.));
 wc+=SAND*.22*pow(pl,3.)*(.5+k*.5);
 wc+=TEAL*.1*pow(fbm(vec2(p.x*6.,p.y*4.+T*.6)),2.);
 for(int l=0;l<3;l++){float fl=float(l);float sc=9.+fl*8.;
  vec2 g=vec2(p.x*sc+fl*3.7,p.y*sc+T*(1.1+fl*.55)*(.6+k*.6));
  vec2 id=floor(g);vec2 f=fract(g)-.5;float h=h21(id+fl*13.1);
  if(h>.8-k*.12){float r=.06+.3*pow(h21(id+7.3),2.);
   f.x+=sin(T*3.+h*40.)*.1;
   float d=length(f);
   float rim=smoothstep(r,r-.04,d)*smoothstep(r-.13,r-.03,d);
   float sp=smoothstep(.07,.0,length(f-vec2(-r*.38,-r*.38)));
   float body=smoothstep(r,r-.02,d)*.12;
   float fd=smoothstep(.0,.06,dp)*(1.-smoothstep(.4,.9,dp));
   wc+=(INK*(rim*.4+sp*.75)+TEAL*body)*fd*(1.-fl*.22);}}
 wc+=INK*.12*exp(-dp*34.)*(1.+abs(sl)*2.);
 wc*=1.-Q.x;c=wc;}
else{
 float st=fbm(vec2(uv.x*3.5+fbm(uv*4.+T*.05),uv.y*2.2+T*.22));
 c+=vec3(.75,.78,.78)*.09*pow(st,2.)*exp(dp*5.)*k;
 vec2 g=vec2(uv.x*ar*50.,uv.y*30.+T*3.);float hs=h21(floor(g));
 c+=INK*step(.975,hs)*smoothstep(.45,.15,length(fract(g)-.5))*exp(dp*45.)*.6*k;}
c+=INK*(.42+min(abs(sl)*2.5,1.2))*exp(-abs(dp)*R.y*.28)+SAND*.12*exp(-abs(dp)*40.)+TEAL*.18*exp(-abs(dp)*40.);
c*=1.-.32*length(uv-.5);
gl_FragColor=vec4(c,1.);}
`);
