/*
 * StarVault D-point catalog, translated from the ClickHouse repositories
 * (app/Infrastructure/Persistence/ClickHouse/Repositories) in starvault.tech.
 *
 * match: all keys must hold. A string matching /^\/.+\/[a-z]*$/ is a regex ('/re/flags'); else exact.
 *   event   event_name; '*' = any event
 *   element element_name
 *   path    path
 *   url     page_url
 *   prop    { key: value } compared against String(properties[key])
 *   has     property key that must be present; 'a|b' = either
 * props: { key: type } the query reads. 'a|b' = either key satisfies it.
 *   int | numeric | bool | boolstr | string | any; trailing '?' = absence tolerated (warn, not error).
 * elementType: type the query needs from element_name.
 * note: anything the match cannot express (other tables, source_type filters).
 */
self.SV_RULES = [
  {
    code: 'D01',
    title: 'Buy-credits button & credit-balance exposure',
    events: [
      { label: 'Header CTA impression', match: { event: 'impression_header_buy_credits' }, source: 'browser' },
      { label: 'Header CTA click', match: { event: 'click_header_buy_credits' }, props: { 'credits|credit_balance': 'numeric?' }, source: 'browser', note: '`credits` is read with JSONExtractInt (needs a JSON number); `credit_balance` with toInt32OrZero(JSONExtractString).' },
      { label: 'Untagged CTA click', match: { event: 'click', element: '/^buy credits$/i' }, props: { 'credits|credit_balance': 'numeric?' }, source: 'browser' },
      { label: 'Sales page view', match: { event: 'pageview', path: '/^\/credits\/buy$/' }, source: 'browser' },
      { label: 'Package buy click', match: { event: 'click', element: '/^buy_btn_/' }, source: 'browser' },
      { label: 'Purchase landing (payment-status with saleID)', match: { event: '*', path: '/payment-status', url: '/[?&]saleID=[^&#]/' }, source: 'browser' },
    ],
  },
  {
    code: 'D02',
    title: 'Message bell unread badge engagement',
    events: [
      { label: 'Message bell impression', match: { event: 'impression_navbar_message_bell' }, source: 'browser' },
      { label: 'Unread badge impression', match: { event: 'impression_navbar_unread_badge' }, source: 'browser' },
      { label: 'Message received', match: { event: 'message_received' }, source: 'browser' },
      { label: 'Bell click (link to /messages)', match: { event: 'click', prop: { href: '/\\/messages$/' } }, elementType: 'numeric', source: 'browser', note: 'element_name is parsed as the unread count (toUInt32OrDefault); non-numeric reads as 0.' },
    ],
  },
  {
    code: 'D03',
    title: 'Browse card impressions, opens & quick actions',
    events: [
      { label: 'Profile card impression', match: { event: 'profile_impression' }, props: { profile_uuid: 'string?', position: 'numeric?' }, source: 'browser' },
      { label: 'Profile card open', match: { event: 'click_profile_card' }, props: { profile_uuid: 'string?' }, source: 'browser' },
      { label: 'Card wink tap', match: { event: 'click_profile_card_wink' }, props: { profile_uuid: 'string?' }, source: 'browser' },
      { label: 'Card message tap', match: { event: 'click_profile_card_message' }, props: { profile_uuid: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D04',
    title: 'Distance slider & More Filters usage',
    events: [
      { label: 'Filters applied', match: { event: 'filters_applied' }, props: { distance: 'numeric?', results_count: 'numeric', filter_types: 'string?' }, source: 'browser', note: 'filter_types is a comma-joined string.' },
      { label: 'More Filters open', match: { event: 'more_filters_open' }, source: 'browser' },
    ],
  },
  {
    code: 'D06',
    title: 'Online dot & multi-photo badge click-through',
    events: [
      { label: 'Profile card impression', match: { event: 'profile_impression' }, props: { online: 'string', multi_photo: 'string', profile_uuid: 'string?' }, source: 'browser', note: "online / multi_photo must be '1' or '0'; anything else counts as unknown." },
      { label: 'Profile card open', match: { event: 'click_profile_card' }, props: { online: 'string', multi_photo: 'string', profile_uuid: 'string?' }, source: 'browser', note: "online / multi_photo must be '1' or '0'." },
    ],
  },
  {
    code: 'D07',
    title: 'Messages list engagement and unread/read handling',
    events: [
      { label: 'Messages list open', match: { event: 'pageview', path: '/messages' }, source: 'browser' },
      { label: 'Conversation item impression', match: { event: 'impression_conversation_item' }, props: { is_read: 'boolstr' }, source: 'browser' },
      { label: 'Conversation item click', match: { event: 'click_conversation_item' }, props: { is_read: 'boolstr' }, source: 'browser' },
    ],
  },
  {
    code: 'D08',
    title: 'Bookmarked/starred conversations usage',
    events: [
      { label: 'Conversation item impression', match: { event: 'impression_conversation_item' }, props: { conversation_id: 'string', is_bookmarked: 'boolstr' }, source: 'browser' },
      { label: 'Conversation item click', match: { event: 'click_conversation_item' }, props: { conversation_id: 'string', is_bookmarked: 'boolstr' }, source: 'browser' },
    ],
  },
  {
    code: 'D09',
    title: 'Trigger efficiency — profile-initiated opening messages',
    events: [
      { label: 'Trigger message impression', match: { event: 'impression_trigger_message' }, props: { tg: 'numeric', conversation_id: 'string', sender_gender: 'string', message_id: 'string?', sender_uuid: 'string?' }, source: 'browser', note: "Only rows with sender_gender = 'female' count; tg = 1 marks a trigger." },
      { label: 'Received message impression', match: { event: 'impression_message_received' }, props: { tg: 'numeric', conversation_id: 'string', sender_gender: 'string', message_id: 'string?', sender_uuid: 'string?' }, source: 'browser', note: "Only rows with sender_gender = 'female' count; tg = 1 marks a trigger." },
      { label: 'User reply (message sent)', match: { event: 'message_sent' }, props: { conversation_id: 'string', pm: 'bool' }, source: 'browser' },
    ],
  },
  {
    code: 'D10',
    title: 'Chat Page — messages sent & credit spend (free vs paid)',
    events: [
      { label: 'Message send success', match: { event: 'send_message_success' }, props: { pm: 'bool?' }, source: 'browser', note: 'Needs user_uuid set.' },
    ],
  },
  {
    code: 'D11',
    title: 'Chat Page — out-of-credits block at send',
    events: [
      { label: 'Out-of-credits block', match: { event: 'out_of_credits_blocked' }, source: 'browser' },
      { label: 'Package buy click', match: { event: 'click', element: '/^buy_btn_/' }, source: 'browser' },
    ],
  },
  {
    code: 'D12',
    title: 'Chat Page — 200-character limit utilisation',
    events: [
      { label: 'Message sent', match: { event: 'message_sent' }, props: { character_count: 'int?' }, source: 'browser' },
    ],
  },
  {
    code: 'D13',
    title: 'Chat Page — composer feature usage (image attach, emoji)',
    events: [
      { label: 'Message sent', match: { event: 'message_sent' }, source: 'browser' },
      { label: 'Image attach attempt', match: { event: 'image_attach_attempt' }, source: 'browser' },
      { label: 'Image attach success', match: { event: 'image_attach_success' }, source: 'browser' },
      { label: 'Emoji picker open', match: { event: 'emoji_picker_open' }, source: 'browser' },
      { label: 'Wink sent', match: { event: 'wink_sent' }, props: { wink_source: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D14',
    title: 'Chat Page — chat actions (bookmark, delete, avatar)',
    events: [
      { label: 'Chat page view', match: { event: 'pageview', path: '/^\\/messages\\//' }, source: 'browser' },
      { label: 'Chat bookmark added', match: { event: 'chat_bookmark_added' }, source: 'browser' },
      { label: 'Chat bookmark removed', match: { event: 'chat_bookmark_removed' }, source: 'browser' },
      { label: 'Delete intent (single)', match: { event: 'conversation_deleted', prop: { scope: 'single' } }, source: 'browser' },
      { label: 'Delete confirmed', match: { event: 'conversation_delete_confirmed' }, source: 'browser' },
      { label: 'Chat avatar click', match: { event: 'click_chat_avatar' }, source: 'browser' },
      { label: 'Chat username click', match: { event: 'click_chat_username' }, source: 'browser' },
    ],
  },
  {
    code: 'D15',
    title: 'Chat Page — operator reply latency vs user continuation',
    events: [
      { label: 'Member message (server)', match: { event: 'chat_message_sent' }, props: { conversation_id: 'string', profile_uuid: 'string?' }, source: 'server', note: "Counted only with source_type = 'tracking_php' (dating-backend); a browser copy is ignored." },
      { label: 'Operator reply (server)', match: { event: 'chat_reply_sent' }, props: { conversation_id: 'string' }, source: 'server', note: "Counted only with source_type = 'tracking_php' (dating-backend); a browser copy is ignored." },
    ],
  },
  {
    code: 'D16',
    title: 'My Visitors page engagement & onward actions',
    events: [
      { label: 'Visitors page open', match: { event: 'view_visitors_page' }, props: { visitors_shown: 'numeric?', page_load_time_ms: 'int?' }, source: 'browser', note: 'Needs user_uuid set.' },
      { label: 'More visitors loaded', match: { event: 'visitors_more_loaded' }, props: { visitors_shown: 'numeric' }, source: 'browser' },
      { label: 'Visitor card click', match: { event: 'click_visitor_card' }, source: 'browser' },
      { label: 'Message sent', match: { event: 'message_sent' }, source: 'browser' },
      { label: 'Wink sent', match: { event: 'wink_sent' }, source: 'browser' },
    ],
  },
  {
    code: 'D17',
    title: 'My Favorites list usage & conversion to messages',
    events: [
      { label: 'Favorite added', match: { event: 'favorite_added' }, source: 'browser' },
      { label: 'Favorite removed', match: { event: 'favorite_removed' }, source: 'browser' },
      { label: 'Favorites list open', match: { event: 'favorite_list_open' }, source: 'browser' },
      { label: 'Favorite profile open', match: { event: 'favorite_profile_open' }, source: 'browser' },
      { label: 'Message sent', match: { event: 'message_sent' }, source: 'browser' },
    ],
  },
  {
    code: 'D18',
    title: 'Favorited by Others reciprocity',
    events: [
      { label: 'Favorited-by-others tab', match: { event: 'click_favorited_by_others_tab' }, props: { favorited_by_count: 'numeric?' }, source: 'browser' },
      { label: 'Favorited-by-others profile open', match: { event: 'click_favorited_by_others_profile' }, source: 'browser' },
      { label: 'Favorited-by-others message', match: { event: 'click_favorited_by_others_message' }, source: 'browser' },
    ],
  },
  {
    code: 'D19',
    title: 'My Profile completeness & editing',
    events: [
      {
        label: 'My Profile view',
        match: { event: 'view_my_profile' },
        props: {
          has_avatar: 'bool', about_filled: 'bool', photo_count: 'int?',
          body_type_filled: 'bool', height_filled: 'bool', eye_color_filled: 'bool',
          hair_color_filled: 'bool', tattoos_filled: 'bool', piercings_filled: 'bool',
        },
        source: 'browser',
      },
      { label: 'Edit profile click', match: { event: 'click_edit_profile' }, source: 'browser' },
      { label: 'Edit About Me click', match: { event: 'click_edit_about_me' }, source: 'browser' },
      { label: 'Edit appearance click', match: { event: 'click_edit_appearance' }, source: 'browser' },
      { label: 'Edit photos click', match: { event: 'click_edit_photos' }, source: 'browser' },
      { label: 'Make primary photo click', match: { event: 'click_make_primary_photo' }, source: 'browser' },
      { label: 'Remove photo click', match: { event: 'click_remove_photo' }, source: 'browser' },
      { label: 'Upload photo banner impression', match: { event: 'impression_upload_photo_banner' }, source: 'browser' },
    ],
  },
  {
    code: 'D20',
    title: 'My Profile completeness vs inbound engagement',
    events: [
      { label: 'Profile snapshot', match: { event: 'profile_snapshot' }, props: { completeness_score: 'int', photo_count: 'int', visits_received: 'int?', winks_received: 'int?', messages_received: 'int?' }, source: 'browser', note: 'Needs user_uuid set. Counters are gated as a group on visits_received being present.' },
    ],
  },
  {
    code: 'D21',
    title: 'Footer navigation & legal/help link clicks',
    events: [
      { label: 'Footer link click', match: { event: 'click_footer_link' }, props: { link: 'string' }, source: 'browser', note: 'link should be one of browse_profiles, messages, my_profile, my_visitors, buy_credits, account_settings, prices, how_to_pay, terms_of_use, privacy_policy, faq, helpdesk, notice_2257.' },
    ],
  },
  {
    code: 'D22',
    title: 'Prices / How to pay / FAQ / Helpdesk engagement',
    events: [
      { label: 'Support page view', match: { event: 'pageview', path: '/^\\/(prices|how-to-pay|faq|helpdesk)$/' }, source: 'browser' },
      { label: 'Page leave (dwell end)', match: { event: 'page_leave' }, source: 'browser', note: 'Only its timestamp is used; dwell = gap to the next pageview/page_leave in the session.' },
      { label: 'Any pageview (dwell end)', match: { event: 'pageview' }, source: 'browser', note: 'Ends the previous support page dwell.' },
      { label: 'Helpdesk contact', match: { event: 'helpdesk_contact' }, props: { category: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D23',
    title: 'Buy Credits page — funnel by entry source & package',
    events: [
      { label: 'Sales page view', match: { event: 'pageview', path: '/^\/credits\/buy$/' }, source: 'browser', note: 'Entry source comes from the starvault_sales_page_arrivals table, not this event.' },
      { label: 'Package buy click', match: { event: 'click', element: '/^buy_btn_/' }, source: 'browser', note: 'Package key = element_name after buy_btn_.' },
      { label: 'Purchase completed', match: { event: 'purchase_completed' }, props: { transaction_id: 'string', amount: 'numeric', currency: 'string?', plan_name: 'string?' }, source: 'browser', note: 'Needs user_uuid for the entry-source join.' },
    ],
  },
  {
    code: 'D24',
    title: 'Buy Credits page — package mix & value-badge uptake',
    events: [
      { label: 'Purchase completed', match: { event: 'purchase_completed' }, props: { transaction_id: 'string', amount: 'numeric', currency: 'string?', plan_name: 'string?', is_best_seller: 'bool?', discount: 'int?', addons_credits: 'int?' }, source: 'browser' },
    ],
  },
  {
    code: 'D25',
    title: 'Buy Credits page: payment completion & method',
    events: [
      { label: 'Purchase completed', match: { event: 'purchase_completed' }, props: { transaction_id: 'string', amount: 'numeric', currency: 'string?', provider: 'string?' }, source: 'browser' },
      { label: 'Purchase started', match: { event: 'purchase_started' }, props: { provider: 'string?' }, source: 'browser' },
      { label: 'Purchase failed', match: { event: 'purchase_failed' }, props: { amount: 'numeric', provider: 'string?', reason: 'string?' }, source: 'unknown', note: 'No emitter found in the frontends or dating-backend; test fixtures seed it as source_type server.' },
    ],
  },
  {
    code: 'D26',
    title: 'Hamburger menu navigation item usage',
    events: [
      { label: 'Hamburger menu open', match: { event: 'click_hamburger_menu', prop: { action: 'opening' } }, source: 'browser' },
      { label: 'Hamburger nav item click', match: { event: 'click_hamburger_nav_item', prop: { item: '/^(browse_nav|messages_nav|my_profile_nav|my_visitors_nav|my_favorites_nav|account_settings_nav|logout_nav)$/' } }, props: { item: 'string' }, source: 'browser' },
      { label: 'Hamburger Buy Credits click', match: { event: 'click_header_buy_credits', prop: { placement: 'mobile_menu_link' } }, source: 'browser' },
    ],
  },
  {
    code: 'D27',
    title: 'Hamburger menu engagement stats vs click-through',
    events: [
      { label: 'Hamburger menu open', match: { event: 'click_hamburger_menu', prop: { action: 'opening' } }, source: 'browser' },
      { label: 'Engagement stat click', match: { event: 'click_engagement_stat', prop: { stat: '/^(profile_visits|total_messages|winks_received)$/' } }, props: { stat: 'string' }, source: 'browser' },
    ],
  },
  {
    code: 'D28',
    title: 'Account Settings — profile & account actions',
    events: [
      { label: 'Account settings open', match: { event: 'pageview', path: '/account' }, source: 'browser' },
      { label: 'Update settings click', match: { event: 'click_update_settings' }, source: 'browser' },
      { label: 'Username updated', match: { event: 'username_updated' }, source: 'browser' },
      { label: 'Password changed', match: { event: 'password_changed' }, source: 'browser' },
    ],
  },
  {
    code: 'D29',
    title: 'Account Settings — account deletion',
    events: [
      { label: 'Delete account click', match: { event: 'click_delete_account' }, source: 'browser' },
      { label: 'Account deleted', match: { event: 'account_deleted' }, props: { credits: 'int?', days_since_signup: 'int?' }, source: 'browser' },
    ],
  },
  {
    code: 'D30',
    title: 'Account Settings — email notification preferences',
    events: [
      { label: 'Notification preferences snapshot', match: { event: 'notification_preferences' }, props: { all_on: 'bool', messages_on: 'bool', winks_on: 'bool', media_on: 'bool' }, source: 'browser', note: 'Needs user_uuid set.' },
      { label: 'Notification preferences saved', match: { event: 'notification_preferences_saved' }, props: { changed: 'int' }, source: 'browser' },
    ],
  },
  {
    code: 'D31',
    title: 'Notification opt-in impact on re-engagement',
    events: [
      { label: 'Notification preferences snapshot', match: { event: 'notification_preferences' }, props: { all_on: 'bool', messages_on: 'bool', winks_on: 'bool', media_on: 'bool' }, source: 'browser', note: 'Needs user_uuid set. Return activity comes from starvault_user_daily_activities, not events.' },
    ],
  },
  {
    code: 'D32',
    title: 'Account Settings (Payments): transaction history & spend pattern',
    events: [
      { label: 'Profile complete (cohort)', match: { event: 'profile_complete' }, props: { registered_at: 'string' }, source: 'browser', note: 'Needs user_uuid set; registered_at must parse as a date-time.' },
      { label: 'Purchase completed', match: { event: 'purchase_completed' }, props: { transaction_id: 'string?' }, source: 'browser' },
      { label: 'Payments tab click', match: { event: 'click_account_settings_tab', prop: { tab: 'payments' } }, source: 'browser' },
    ],
  },
  {
    code: 'D33',
    title: 'Profile detail page conversion (Message / Wink / Favorite)',
    events: [
      { label: 'Profile detail view', match: { event: 'impression_profile_detail_view' }, props: { profile_id: 'string?' }, source: 'browser', note: 'Dropped when profile_id equals user_uuid (self view).' },
      { label: 'Message Me click', match: { event: 'click_profile_detail_message_me' }, props: { profile_id: 'string?' }, source: 'browser' },
      { label: 'Send Wink click', match: { event: 'click_profile_detail_send_wink' }, props: { profile_id: 'string?' }, source: 'browser' },
      { label: 'Favorite add click', match: { event: 'click_profile_detail_favorite', prop: { action: 'add' } }, props: { profile_id: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D34',
    title: 'Request more photos — demand & fulfilment',
    events: [
      { label: 'Request more photos impression', match: { event: 'impression_request_more_photos' }, props: { profile_id: 'string?' }, source: 'browser', note: 'Dropped when profile_id equals user_uuid (self view).' },
      { label: 'Request more photos click', match: { event: 'click_request_more_photos' }, props: { profile_id: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D35',
    title: 'Profile detail — photo viewing',
    events: [
      { label: 'Profile detail view', match: { event: 'impression_profile_detail_view' }, props: { profile_id: 'string?', photos_available: 'numeric?' }, source: 'browser', note: 'Dropped when profile_id equals user_uuid (self view).' },
      { label: 'Photo viewed', match: { event: 'photo_viewed' }, props: { profile_id: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D36',
    title: 'Appearance attributes vs profile performance',
    events: [
      {
        label: 'Profile detail view',
        match: { event: 'impression_profile_detail_view' },
        props: {
          profile_id: 'string?', age: 'numeric?', height: 'numeric?', body_type: 'string?', eye_color: 'string?',
          hair_color: 'string?', tattoos: 'string?', piercings: 'string?', gender: 'string?',
        },
        source: 'browser',
        note: "Blank or 'null' attributes fall into the unknown bucket.",
      },
      { label: 'Message sent', match: { event: 'message_sent' }, props: { recipient_uuid: 'string?', conversation_id: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D37',
    title: 'Winks — volume, recipients & conversion to replies',
    events: [
      { label: 'Wink sent', match: { event: 'wink_sent' }, props: { recipient_uuid: 'string?', wink_source: 'string?', wink_type: 'string?' }, source: 'browser', note: "Winks without recipient_uuid drop out of the conversion figures; 'null' counts as missing." },
      { label: 'Message sent', match: { event: 'message_sent' }, props: { recipient_uuid: 'string?' }, source: 'browser' },
      { label: 'Message send success', match: { event: 'send_message_success' }, props: { recipient_uuid: 'string?' }, source: 'browser' },
      { label: 'Message received', match: { event: 'message_received' }, props: { sender_uuid: 'string?' }, source: 'browser' },
      { label: 'Received message impression', match: { event: 'impression_message_received' }, props: { sender_uuid: 'string?' }, source: 'browser' },
    ],
  },
  {
    code: 'D38',
    title: 'Credit economy — balance, spend by action & low-balance moments',
    events: [
      { label: 'Purchase completed', match: { event: 'purchase_completed' }, props: { transaction_id: 'string', credits_purchased: 'numeric?', plan_name: 'string?', addons_credits: 'int?' }, source: 'browser', note: 'credits_purchased falls back to the digits in plan_name.' },
      { label: 'Credits spent', match: { event: 'credits_spent' }, props: { action: 'string', credit_cost: 'numeric' }, source: 'browser' },
      { label: 'Any event carrying a credit balance', match: { event: '*', has: 'credits|credit_balance' }, props: { 'credits|credit_balance': 'numeric' }, source: 'browser', note: 'Needs user_uuid set. `credits` is read with JSONExtractInt (needs a JSON number).' },
      { label: 'Low-credits banner impression', match: { event: 'impression_low_credits_banner' }, source: 'browser' },
      { label: 'Low-credits banner click', match: { event: 'click', element: 'out_of_credits_in_chat' }, source: 'browser' },
      { label: 'Out-of-credits block', match: { event: 'out_of_credits_blocked' }, source: 'browser' },
    ],
  },
  {
    code: 'D40',
    title: 'Hamburger menu — user-avatar clicks through to own profile',
    events: [
      { label: 'Hamburger menu open', match: { event: 'click_hamburger_menu', prop: { action: 'opening' } }, source: 'browser' },
      { label: 'Menu avatar impression', match: { event: 'impression_hamburger_user_avatar' }, source: 'browser' },
      { label: 'Menu avatar click', match: { event: 'click_hamburger_user_avatar' }, source: 'browser' },
      { label: 'My Profile nav click', match: { event: 'click_hamburger_nav_item', prop: { item: 'my_profile_nav' } }, source: 'browser' },
      { label: 'Profile editor view', match: { event: 'pageview', path: '/^\/profile\/edit$/' }, source: 'browser' },
    ],
  },
];
