const BASE='https://api.printify.com/v1';

export function createPrintifyClient({token,fetchImpl=fetch}){
  if(!token)throw new Error('Printify is not configured.');
  async function request(path,{method='GET',body}={}){
    const response=await fetchImpl(BASE+path,{method,headers:{Authorization:`Bearer ${token}`,'User-Agent':'VisionMakeStudio-PrintShop/0.5 (info@visionmakestudio.com)',Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let value={};try{value=text?JSON.parse(text):{};}catch{}
    if(!response.ok){const error=new Error(response.status===401?'Printify rejected the saved token. Create a new restricted token and replace PRINTIFY_API_TOKEN in Netlify.':response.status===403?'The Printify token is missing a required read or write scope.':response.status===429?'Printify is busy. Wait a minute before checking again.':`Printify returned an error (${response.status}).`);error.status=response.status;throw error;}
    return value;
  }
  return {
    shops:()=>request('/shops.json'),blueprints:()=>request('/catalog/blueprints.json'),providers:id=>request(`/catalog/blueprints/${id}/print_providers.json`),variants:(blueprint,provider)=>request(`/catalog/blueprints/${blueprint}/print_providers/${provider}/variants.json?show-out-of-stock=0`),
    upload:({fileName,contents})=>request('/uploads/images.json',{method:'POST',body:{file_name:fileName,contents}}),
    createProduct:(shopId,payload)=>request(`/shops/${shopId}/products.json`,{method:'POST',body:payload})
  };
}
