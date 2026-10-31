// Container-local probe only. Never prints configuration or credentials.
const port=Number(process.env.PORT ?? 4000);
try{
  if(!Number.isInteger(port) || port<1 || port>65535)throw new Error("Invalid probe port");
  const response=await fetch(`http://127.0.0.1:${port}/health/ready`,{signal:AbortSignal.timeout(4000)});
  if(!response.ok)process.exitCode=1;
}catch{process.exitCode=1;}
export {};
