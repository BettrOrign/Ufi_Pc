import { addThinking, removeThinking } from '../../interface/chat.js';
import { safeFetch, wrapHandler } from './shared.js';

export const handleDeepResearch = wrapHandler(async (args) => {
  const { topic } = args;
  
  if (!topic) {
    return { error: 'Research topic is required' };
  }
  
  console.log('[DeepResearch] Topic:', topic);
  addThinking('🔍 Исследую тему...');
  
  try {
    const result = await safeFetch('/api/research/deep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    }, 95000); // 95s timeout — research takes a while
    
    removeThinking();
    
    if (!result.ok) {
      return { error: `Research failed: ${result.error}` };
    }
    
    const data = result.data;
    
    if (!data || (!data.report && data.error)) {
      return {
        result: data?.report || 'No results found',
        report: data?.report || '',
        error: data?.error || null,
        sourceCount: data?.sources?.length || 0,
      };
    }
    
    return {
      result: data.report || 'No results found',
      report: data.report || '',
      sourceCount: data?.sourceCount || 0,
    };
  } catch (err) {
    removeThinking();
    return { error: 'Deep research failed: ' + err.message };
  }
});
