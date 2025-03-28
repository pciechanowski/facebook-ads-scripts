/**
 * @OnlyCurrentDoc
 */
// to na gorze to jest obejscie na gazomierzu na potrzeby advanced protection - nie wiem jak działa, gdzies znalazlem

// raportowanie kilku osob robiacych kampanie
var AUTHOR_MAPPING = {
  "PC": "Patryk",
  "AA": "Aaa",
  "BB": "Abb"
};

// Helper function do filtrowania po autorach
function extractAuthor(campaignName) {
  // Dopasowuje nazwe autora - 2 litery w kwadratowym nawiasie
  if (!campaignName) return "";
  var match = campaignName.match(/\[?(AA|PC|BB)\]?/);
  return match ? AUTHOR_MAPPING[match[1]] || "" : "";
}

function fetchFacebookAdsData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var baseUrl = 'https://graph.facebook.com/v21.0/act_123456789/insights';  // tutaj same cyferki podmieniasz na id konta reklamowego po act_
  // instrukcja:
  // tworzysz aplikacje w: https://developers.facebook.com/apps/ 
  // Tu prawdopodobnie wybierasz: Authenticate and request data from users with Facebook Login (albo other).
  // app type - najczęściej "Business"

  // uzyj id [wyciągarka do danych] https://developers.facebook.com/tools/explorer/123456789/
  // preferowane Permissions :
  // read_insights
  // pages_show_list
  // ads_management
  // ads_read
  // business_management
  // page_events
  // pages_read_engagement
  // pages_read_user_content
  // tu trzeba zrobić debugowanie i wydłużenie tokena bo ten co generowales wczesniej to 3h wazny https://developers.facebook.com/tools/debug/accesstoken/
  // aktualizacja tokena 7 marca. Trzeba ogarnac oauth2 -> graph api. Przypomnij mi XD
  var params = {
    'method': 'get',
    'headers': {
      'Authorization': 'Bearer TOKEN' // zamiast TOKEN wklejasz bearer token

//     

    },
    'muteHttpExceptions': true
  };

  // enable/disable specific date ranges bo czasem nie ogarnia za duzo
  var settings = {
    yesterday: true,
    last7days: true,
    last14days: true,
    last30days: true,
    currentMonth: true,
    lastMonth: true
  };

  // funkcja do pobierania danych
  function fetchData(datePreset) {
    var queryParams = {
      'fields': 'campaign_name,impressions,clicks,spend,actions,action_values',
      'level': 'campaign',
      'date_preset': datePreset,
      'limit': 500 // YOLO. dam od razu 500 rekordów
    };

    var data = [];
    Logger.log("Fetching data for: " + datePreset);  // logi
    var nextPageUrl = baseUrl + '?' + Object.keys(queryParams).map(function(key) {
      return key + '=' + encodeURIComponent(queryParams[key]);
    }).join('&');

    while (nextPageUrl) {
      var response = UrlFetchApp.fetch(nextPageUrl, params);
      if (response.getResponseCode() == 200) {
        var json = JSON.parse(response.getContentText());
        data = data.concat(json.data);
        Logger.log("Fetched records: " + json.data.length);  // logi

        nextPageUrl = json.paging && json.paging.next ? json.paging.next : null;
      } else {
        Logger.log('Error: ' + response.getResponseCode());
        Logger.log('Response: ' + response.getContentText());
        break;
      }
    }

    return data;
  }

  // wyciaganie purchases, conversion values, i obliczanie ROAS
  function extractMetrics(data) {
    var purchases = 0;
    var conversionValue = 0;
    var spend = data.spend || 0;
    var roas = 0;

    if (data.actions) {
      data.actions.forEach(function(action) {
        if (action.action_type === 'purchase') {
          purchases = action.value;
        }
      });
    }

    if (data.action_values) {
      data.action_values.forEach(function(actionValue) {
        if (actionValue.action_type === 'purchase') {
          conversionValue = actionValue.value;
        }
      });
    }

    if (spend > 0) {
      roas = conversionValue / spend;
    }

    return {
      purchases: purchases,
      conversionValue: conversionValue,
      spend: spend,
      roas: roas
    };
  }

  // tu potrzebowalem usunac z campaignName rozne rzeczy
  function cleanCampaignName(campaignName) {
    return campaignName
      .replace(/\[PC\]|\[IG\]|\[FB\]/gi, '')
      .replace(/sales|reach|AddToCart|ruch/gi,'')
      .trim();
  }

  // tu miałem do 
  function extractCampaignID(campaignName) {
    var match = campaignName.match(/\[id:(\d+)\]/);
    return match ? match[1] : '';
  }

  // Clear the previous data
  sheet.clear();

  // Append headers with new date ranges and Author column
  sheet.appendRow([
    'Campaign Name', 'Author', 'Clean Campaign Name', 'Custom Campaign ID',
    'Impressions (Yesterday)', 'Impressions (Last 7 Days)', 'Impressions (Last 14 Days)', 'Impressions (Last 30 Days)', 'Impressions (Current Month)', 'Impressions (Last Month)',
    'Clicks (Yesterday)', 'Clicks (Last 7 Days)', 'Clicks (Last 14 Days)', 'Clicks (Last 30 Days)', 'Clicks (Current Month)', 'Clicks (Last Month)',
    'Spend (Yesterday)', 'Spend (Last 7 Days)', 'Spend (Last 14 Days)', 'Spend (Last 30 Days)', 'Spend (Current Month)', 'Spend (Last Month)',
    'Purchases (Yesterday)', 'Purchases (Last 7 Days)', 'Purchases (Last 14 Days)', 'Purchases (Last 30 Days)', 'Purchases (Current Month)', 'Purchases (Last Month)',
    'Conversion Value (Yesterday)', 'Conversion Value (Last 7 Days)', 'Conversion Value (Last 14 Days)', 'Conversion Value (Last 30 Days)', 'Conversion Value (Current Month)', 'Conversion Value (Last Month)',
    'ROAS (Yesterday)', 'ROAS (Last 7 Days)', 'ROAS (Last 14 Days)', 'ROAS (Last 30 Days)', 'ROAS (Current Month)', 'ROAS (Last Month)'
  ]);

  // Create a map to store aggregated campaign-level data
  var campaignMap = {};

  // Helper function to aggregate data by campaign
  function aggregateData(datePreset, data, fieldPrefix) {
    if (data) {
      data.forEach(function(item) {
        var originalCampaignName = item.campaign_name;
        var author = extractAuthor(originalCampaignName);
        var campaignName = originalCampaignName;
        var cleanName = cleanCampaignName(campaignName);
        var customID = extractCampaignID(campaignName);
        var metrics = extractMetrics(item);

        // Initialize campaign entry if it doesn't exist
        if (!campaignMap[campaignName]) {
          campaignMap[campaignName] = {
            cleanName: cleanName,
            customID: customID,
            author: author
          };
        }
        campaignMap[campaignName][fieldPrefix + 'Impressions'] = (campaignMap[campaignName][fieldPrefix + 'Impressions'] || 0) + (item.impressions || 0);
        campaignMap[campaignName][fieldPrefix + 'Clicks'] = (campaignMap[campaignName][fieldPrefix + 'Clicks'] || 0) + (item.clicks || 0);
        campaignMap[campaignName][fieldPrefix + 'Spend'] = (campaignMap[campaignName][fieldPrefix + 'Spend'] || 0) + metrics.spend;
        campaignMap[campaignName][fieldPrefix + 'Purchases'] = (campaignMap[campaignName][fieldPrefix + 'Purchases'] || 0) + metrics.purchases;
        campaignMap[campaignName][fieldPrefix + 'ConversionValue'] = (campaignMap[campaignName][fieldPrefix + 'ConversionValue'] || 0) + metrics.conversionValue;
        campaignMap[campaignName][fieldPrefix + 'ROAS'] = (metrics.spend > 0) ? (campaignMap[campaignName][fieldPrefix + 'ConversionValue'] / metrics.spend) : 0;
      });
    }
  }

  // pobieranie danych
  if (settings.yesterday) {
    var yesterdayData = fetchData('yesterday');
    aggregateData('yesterday', yesterdayData, 'Yesterday');
  }
  if (settings.last7days) {
    var last7DaysData = fetchData('last_7d');
    aggregateData('last7days', last7DaysData, 'Last7Days');
  }
  if (settings.last14days) {
    var last14DaysData = fetchData('last_14d');
    aggregateData('last14days', last14DaysData, 'Last14Days');
  }
  if (settings.last30days) {
    var last30DaysData = fetchData('last_30d');
    aggregateData('last30days', last30DaysData, 'Last30Days');
  }
  if (settings.currentMonth) {
    var currentMonthData = fetchData('this_month');
    aggregateData('currentMonth', currentMonthData, 'CurrentMonth');
  }
  if (settings.lastMonth) {
    var lastMonthData = fetchData('last_month');
    aggregateData('lastMonth', lastMonthData, 'LastMonth');
  }

  // agregacja danych i zapis
  for (var campaign in campaignMap) {
    var row = campaignMap[campaign];
    sheet.appendRow([
      campaign,
      row.author,
      row.cleanName,
      row.customID,
      row.YesterdayImpressions || 0, row.Last7DaysImpressions || 0, row.Last14DaysImpressions || 0, row.Last30DaysImpressions || 0, row.CurrentMonthImpressions || 0, row.LastMonthImpressions || 0,
      row.YesterdayClicks || 0, row.Last7DaysClicks || 0, row.Last14DaysClicks || 0, row.Last30DaysClicks || 0, row.CurrentMonthClicks || 0, row.LastMonthClicks || 0,
      row.YesterdaySpend || 0, row.Last7DaysSpend || 0, row.Last14DaysSpend || 0, row.Last30DaysSpend || 0, row.CurrentMonthSpend || 0, row.LastMonthSpend || 0,
      row.YesterdayPurchases || 0, row.Last7DaysPurchases || 0, row.Last14DaysPurchases || 0, row.Last30DaysPurchases || 0, row.CurrentMonthPurchases || 0, row.LastMonthPurchases || 0,
      row.YesterdayConversionValue || 0, row.Last7DaysConversionValue || 0, row.Last14DaysConversionValue || 0, row.Last30DaysConversionValue || 0, row.CurrentMonthConversionValue || 0, row.LastMonthConversionValue || 0,
      row.YesterdayROAS || 0, row.Last7DaysROAS || 0, row.Last14DaysROAS || 0, row.Last30DaysROAS || 0, row.CurrentMonthROAS || 0, row.LastMonthROAS || 0
    ]);
  }
  Logger.log("Campaigns written to sheet: " + Object.keys(campaignMap).length);

}
