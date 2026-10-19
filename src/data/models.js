export const models = [
 {id:1,name:'DeepSeek V4 Flash',provider:'DeepSeek',type:'Text',price:0.60,direct:2.10,discount:71,latency:'0.8s',status:'Healthy'},
 {id:2,name:'Claude Opus 4.6',provider:'Anthropic',type:'Text',price:12,direct:25,discount:48,latency:'1.4s',status:'Healthy'},
 {id:3,name:'Claude Sonnet 4.6',provider:'Anthropic',type:'Text',price:3.20,direct:15,discount:63,latency:'0.9s',status:'Healthy'},
 {id:4,name:'Qwen 3 235B Instruct',provider:'Alibaba',type:'Text',price:0.72,direct:3,discount:76,latency:'1.1s',status:'Healthy'},
 {id:5,name:'MiniMax M2.7',provider:'MiniMax',type:'Text',price:0.85,direct:2.80,discount:69,latency:'0.7s',status:'Healthy'},
 {id:6,name:'Luma Dream Machine',provider:'Luma',type:'Video',price:0.09,direct:0.14,discount:32,latency:'18s',status:'Limited'},
 {id:7,name:'Flux Image Pro',provider:'Black Forest Labs',type:'Image',price:0.025,direct:0.042,discount:41,latency:'5s',status:'Healthy'},
 {id:8,name:'ElevenLabs Voice',provider:'ElevenLabs',type:'Audio',price:0.018,direct:0.028,discount:35,latency:'2.2s',status:'Healthy'}
];
export const money = n => '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
