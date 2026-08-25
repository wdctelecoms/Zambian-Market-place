/* Zambian Marketplace — Supabase live data layer */
(function () {
  const SUPABASE_URL = 'https://iqurvvxmfjfvlkvfsanq.supabase.co';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';
  if (!window.supabase || !SUPABASE_ANON_KEY) return;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.marketplaceSupabase = client;
  async function requireUser(){ const {data:{user}}=await client.auth.getUser(); if(!user) throw new Error('Authentication required'); return user; }
  async function customerId(uid){ const {data,error}=await client.from('Customer').select('id').eq('userId',uid).maybeSingle(); if(error) throw error; return data?.id||null; }
  window.marketplaceLive={client,requireUser,
    async products({categoryId,search}={}){let q=client.from('Product').select('*').eq('isAvailable',true).order('createdAt',{ascending:false});if(categoryId)q=q.eq('categoryId',categoryId);if(search)q=q.ilike('name',`%${search}%`);const{data,error}=await q;if(error)throw error;return data||[]},
    async categories(){const{data,error}=await client.from('Category').select('*').order('name');if(error)throw error;return data||[]},
    async cart(){const u=await requireUser(),cid=await customerId(u.id);if(!cid)return null;const{data:cart,error:ce}=await client.from('Cart').select('*').eq('customerId',cid).maybeSingle();if(ce)throw ce;if(!cart)return null;const{data:items,error}=await client.from('CartItem').select('*').eq('cartId',cart.id);if(error)throw error;return{...cart,items:items||[]}},
    async orders(){const u=await requireUser(),cid=await customerId(u.id);if(!cid)return[];const{data,error}=await client.from('Order').select('*').eq('customerId',cid).order('createdAt',{ascending:false});if(error)throw error;return data||[]},
    async favorites(){const u=await requireUser(),cid=await customerId(u.id);if(!cid)return[];const{data,error}=await client.from('Favorite').select('*').eq('customerId',cid);if(error)throw error;return data||[]},
    async reviews(productId){const{data,error}=await client.from('Review').select('*').eq('productId',productId).order('createdAt',{ascending:false});if(error)throw error;return data||[]},
    subscribeProducts(cb){return client.channel('marketplace-products').on('postgres_changes',{event:'*',schema:'public',table:'Product'},cb).subscribe()}
  };
})();
