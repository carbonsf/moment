// Shaders for the four directions. Coordinates: K = (x, y, r) with x,y in 0..1 top-origin, r in screen-width units.
MomentGL.add('field', `
void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=(gl_FragCoord.xy-.5*R)/R.y*2.;
float t=T*.05,tb=P.x;
vec2 q=vec2(fbm(p*1.1+vec2(0.,t)),fbm(p*1.1+vec2(5.2,1.3)-t));
vec2 r=vec2(fbm(p+(2.+2.*tb+.7*B)*q+vec2(1.7,9.2)+t*.7),fbm(p+(2.+2.*tb)*q+vec2(8.3,2.8)-t*.5));
float f=fbm(p+(2.5+1.5*tb)*r);
float yy=1.-uv.y;
float band=exp(-abs(yy-L)*mix(16.,5.,tb))*P.y;
vec3 c=BG*.85;
c=mix(c,vec3(.05,.15,.17),clamp(f*f*1.7,0.,1.));
c=mix(c,TEAL*.5,clamp(length(q)*.55*f*f,0.,1.));
c+=SAND*pow(f,3.)*.45*(.25+band*2.2);
c+=TEAL*band*.3*f;
float d=length(p-vec2(0.,P.w));
c+=TEAL*P.z*(smoothstep(.035,0.,abs(d-(.38+.14*B)))*.55+exp(-d*2.5)*.18*B);
c*=1.-Q.x;
c*=1.-.4*length(uv-.5);
gl_FragColor=vec4(c,1.);}
`);

MomentGL.add('stone', `
void main(){vec2 fc=vec2(gl_FragCoord.x,R.y-gl_FragCoord.y)/R.x;float ar=R.y/R.x;
vec3 c=mix(vec3(.105,.098,.092),vec3(.045,.045,.05),fc.y/ar);
c+= (fbm(fc*90.)-.5)*.025;
float hz=0.;
for(int i=0;i<8;i++){if(float(i)>=N)break;vec3 k=K[i];vec2 c0=vec2(k.x,k.y*ar);
 float r=k.z*(i==0?1.+.03*B*P.z:1.);
 if(i==0)hz=exp(-length(fc-c0)/r*1.1);
 float sh=smoothstep(1.3,.1,length((fc-c0-vec2(r*.18,r*.62))/vec2(r*1.15,r*.5)));c*=1.-.6*sh;}
c+=vec3(1.,.62,.36)*.22*P.x*hz;
for(int i=0;i<8;i++){if(float(i)>=N)break;vec3 k=K[i];vec2 c0=vec2(k.x,k.y*ar);
 float r=k.z*(i==0?1.+.03*B*P.z:1.);
 vec2 d=(fc-c0)/(r*vec2(1.,.8));float an=atan(d.y,d.x);
 float e=1.+.05*sin(an*3.+k.x*20.)+.03*sin(an*5.+k.y*13.);
 float l=length(d)/e;
 if(l<1.03){float z=sqrt(max(1.-l*l,0.));
  vec3 n=normalize(vec3(d/e,z*1.1));
  n.xy+=(vec2(fbm(d*5.+k.x*9.),fbm(d*5.+3.+k.y*9.))-.5)*.3;n=normalize(n);
  vec3 Ld=normalize(vec3(-.55,-.65,.7));float df=max(dot(n,Ld),0.);
  vec3 al=mix(vec3(.25,.245,.24),vec3(.43,.41,.38),fbm(d*2.5+k.x*5.));al*=.86+.28*ns(d*38.+k.y*7.);
  if(Q.y==float(i))al=mix(al,vec3(.36,.42,.43),.5);
  vec3 col=al*(.1+.95*df);
  col+=pow(max(dot(reflect(-Ld,n),vec3(0,0,1)),0.),20.)*.22;
  col+=TEAL*.07*pow(1.-z,3.);
  if(i==0){float h=P.x;float cr=1.-smoothstep(0.,.05,abs(fbm(d*3.2+7.)-.5));float core=exp(-l*l*2.2);
   vec3 em=mix(SAND,vec3(1.,.5,.26),.55);col+=em*h*(core*.55*h+cr*core*1.4)*(.75+.25*B);}
  c=mix(c,col,smoothstep(1.,.965,l));}
 if(Q.x==float(i)){float g=length(d);c+=TEAL*.35*smoothstep(.06,0.,abs(g-1.18-.04*B));}
}
c*=1.-.35*length(vec2(fc.x-.5,fc.y/ar-.5));
gl_FragColor=vec4(c,1.);}
`);

MomentGL.add('mercury', `
vec3 env(vec3 d){float s=sin(T*.08)*.3;d.x+=s;
vec3 e=mix(vec3(.025,.03,.035),TEAL*.75,smoothstep(.1,-.9,d.y));
e+=SAND*exp(-abs(d.y+.12)*10.)*.75;
e+=INK*1.3*smoothstep(.22,.0,length(d.xy-vec2(-.45,-.6)));
e+=TEAL*.5*smoothstep(.3,.0,length(d.xy-vec2(.6,-.3)));
e+=vec3(.05,.07,.08)*step(0.,d.y)*(1.-d.y);
return e;}
void main(){vec2 fc=vec2(gl_FragCoord.x,R.y-gl_FragCoord.y)/R.x;float ar=R.y/R.x;
float f=0.;vec2 g=vec2(0.);
for(int i=0;i<8;i++){if(float(i)>=N)break;vec3 k=K[i];vec2 c0=vec2(k.x,k.y*ar);
 c0+=vec2(sin(T*.7+float(i)*1.7),cos(T*.6+float(i)*2.3))*.004*P.y;
 float r=k.z*(1.+P.z*.05*B*(i==0?1.:.4));
 vec2 dd=fc-c0;float RR=r*r*4.84;float x=dot(dd,dd)/RR;if(x<1.){float w=1.-x;f+=w*w*w;g+=-6.*w*w*dd/RR;}}
vec3 c=mix(vec3(.06,.065,.075),vec3(.03,.032,.036),fc.y/ar);
float gl=length(g)+1e-4;
float a=clamp((f-.35)/gl*R.x*.7+.5,0.,1.);
vec3 n=normalize(vec3(-g/(f+.1)*.085,1.));
vec3 rd=reflect(vec3(0,0,-1),n);
vec3 col=env(rd)*.95;
col*=mix(.75,1.,n.z);
col+=TEAL*.12*pow(1.-n.z,2.);
c+=TEAL*.08*smoothstep(0.,.35,f)*(1.-a);
c=mix(c,col,a);
c*=1.-.35*length(vec2(fc.x-.5,fc.y/ar-.5));
gl_FragColor=vec4(c,1.);}
`);

MomentGL.add('tide', `
void main(){vec2 uv=vec2(gl_FragCoord.x/R.x,1.-gl_FragCoord.y/R.y);float ar=R.x/R.y;
float x=uv.x;
float w=(sin(x*7.+T*.9)*.6+sin(x*13.-T*1.3)*.3+sin(x*3.1+T*.4))*.011*P.x*(.6+B);
float sy=1.-L+w-.025*B*P.y+Q.y*(x-.5);
vec3 c=mix(vec3(.09,.095,.105),vec3(.055,.06,.068),uv.y);
c+=(fbm(vec2(uv.x*3.,uv.y*2.-T*.02))-.5)*.03;
float dp=uv.y-sy;
if(dp>0.){
 vec3 wc=mix(vec3(.10,.27,.30),vec3(.015,.04,.055),clamp(dp*2.,0.,1.));
 vec2 cp=vec2(uv.x*ar,uv.y)*5.;
 float k1=fbm(cp+vec2(T*.08,T*.05));float cs=pow(1.-abs(sin(k1*11.)),7.);
 wc+=TEAL*cs*.28*exp(-dp*2.5)*P.z;
 float ry=fbm(vec2(uv.x*7.+uv.y*1.8,T*.04));wc+=TEAL*.1*pow(ry,3.)*exp(-dp*1.5);
 wc*=1.-Q.x;
 c=wc;}
c+=INK*.55*exp(-abs(dp)*R.y*.3)+TEAL*.25*exp(-abs(dp)*45.);
if(dp<0.)c+=TEAL*.05*exp(dp*12.);
c*=1.-.3*length(uv-.5);
gl_FragColor=vec4(c,1.);}
`);
