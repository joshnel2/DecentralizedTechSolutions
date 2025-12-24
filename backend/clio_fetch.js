import fs from 'fs';

// Replace with your actual Clio access token
const ACCESS_TOKEN = process.env.CLIO_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE';

async function fetchAllContacts() {
  const allContacts = [];
  let url = 'https://app.clio.com/api/v4/contacts.json?order=id(asc)&limit=200&fields=id,name,first_name,last_name,type,email_addresses,phone_numbers';
  let page = 1;

  while (url) {
    console.log(`Fetching page ${page}... (${allContacts.length} contacts so far)`);
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error ${response.status}: ${errorText}`);
        break;
      }

      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        allContacts.push(...data.data);
        console.log(`Page ${page}: Got ${data.data.length} contacts, total: ${allContacts.length}`);
      }

      // Follow the next URL from meta.paging.next
      url = data.meta?.paging?.next || null;
      page++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error('Fetch error:', error.message);
      break;
    }
  }

  console.log(`\nDone! Fetched ${allContacts.length} total contacts`);
  
  // Save to file
  fs.writeFileSync('clio_contacts.json', JSON.stringify(allContacts, null, 2));
  console.log('Saved to clio_contacts.json');

  return allContacts;
}

fetchAllContacts();
