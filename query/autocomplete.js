const peliasQuery = require('pelias-query');
const defaults = require('./autocomplete_defaults');
const textParser = require('./text_parser_addressit');
const check = require('check-types');
const logger = require('pelias-logger').get('api');

// additional views (these may be merged in to pelias/query at a later date)
var views = {
  ngrams_strict:              require('./view/ngrams_strict'),
  focus_selected_layers:      require('./view/focus_selected_layers'),
  ngrams_last_token_only:     require('./view/ngrams_last_token_only'),
  phrase_first_tokens_only:   require('./view/phrase_first_tokens_only'),
  pop_subquery:               require('./view/pop_subquery'),
  boost_exact_matches:        require('./view/boost_exact_matches')
};

//------------------------------
// autocomplete query
//------------------------------
var query = new peliasQuery.layout.FilteredBooleanQuery();

// mandatory matches
query.score( views.phrase_first_tokens_only, 'must' );
query.score( views.ngrams_last_token_only, 'must' );
query.score( peliasQuery.view.boundary_country, 'must' );

// address components
query.score( peliasQuery.view.address('housenumber') );
query.score( peliasQuery.view.address('street') );
query.score( peliasQuery.view.address('postcode') );

// admin components
query.score( peliasQuery.view.admin('country') );
query.score( peliasQuery.view.admin('country_a') );
query.score( peliasQuery.view.admin('region') );
query.score( peliasQuery.view.admin('region_a') );
query.score( peliasQuery.view.admin('county') );
query.score( peliasQuery.view.admin('borough') );
query.score( peliasQuery.view.admin('localadmin') );
query.score( peliasQuery.view.admin('locality') );
query.score( peliasQuery.view.admin('neighbourhood') );

// scoring boost
query.score( views.boost_exact_matches );
query.score( views.focus_selected_layers( views.ngrams_strict ) );
query.score( peliasQuery.view.popularity( views.pop_subquery ) );
query.score( peliasQuery.view.population( views.pop_subquery ) );

// non-scoring hard filters
query.filter( peliasQuery.view.sources );
query.filter( peliasQuery.view.layers );
query.filter( peliasQuery.view.boundary_rect );

// --------------------------------

/**
  map request variables to query variables for all inputs
  provided by this HTTP request.
**/
function generateQuery( clean ){

  const vs = new peliasQuery.Vars( defaults );

  let logStr = '[query:autocomplete] [parser:addressit] ';

  // sources
  if( check.array(clean.sources) && clean.sources.length ){
    vs.var( 'sources', clean.sources );
    logStr += '[param:sources] ';
  }

  // layers
  if( check.array(clean.layers) && clean.layers.length ){
    vs.var( 'layers', clean.layers);
    logStr += '[param:layers] ';
  }

  // boundary country
  if( check.string(clean['boundary.country']) ){
    vs.set({
      'boundary:country': clean['boundary.country']
    });
    logStr += '[param:boundary_country] ';
  }

  // pass the input tokens to the views so they can choose which tokens
  // are relevant for their specific function.
  if( check.array( clean.tokens ) ){
    vs.var( 'input:name:tokens', clean.tokens );
    vs.var( 'input:name:tokens_complete', clean.tokens_complete );
    vs.var( 'input:name:tokens_incomplete', clean.tokens_incomplete );
  }

  // input text
  vs.var( 'input:name', clean.text );

  // if the tokenizer has run then we set 'input:name' to as the combination of the
  // 'complete' tokens with the 'incomplete' tokens, the resuting array differs
  // slightly from the 'input:name:tokens' array as some tokens might have been
  // removed in the process; such as single grams which are not present in then
  // ngrams index.
  if( check.array( clean.tokens_complete ) && check.array( clean.tokens_incomplete ) ){
    var combined = clean.tokens_complete.concat( clean.tokens_incomplete );
    if( combined.length ){
      vs.var( 'input:name', combined.join(' ') );
    }
  }

  // focus point
  if( check.number(clean['focus.point.lat']) &&
      check.number(clean['focus.point.lon']) ){
    vs.set({
      'focus:point:lat': clean['focus.point.lat'],
      'focus:point:lon': clean['focus.point.lon']
    });
    logStr += '[param:focus_point] ';
  }

  // boundary rect
  if( check.number(clean['boundary.rect.min_lat']) &&
      check.number(clean['boundary.rect.max_lat']) &&
      check.number(clean['boundary.rect.min_lon']) &&
      check.number(clean['boundary.rect.max_lon']) ){
    vs.set({
      'boundary:rect:top': clean['boundary.rect.max_lat'],
      'boundary:rect:right': clean['boundary.rect.max_lon'],
      'boundary:rect:bottom': clean['boundary.rect.min_lat'],
      'boundary:rect:left': clean['boundary.rect.min_lon']
    });
    logStr += '[param:boundary_rect] ';
  }

  // run the address parser
  if( clean.parsed_text ){
    textParser( clean.parsed_text, vs );
  }

  logger.info(logStr);

  return {
    type: 'autocomplete',
    body: query.render(vs)
  };
}

module.exports = generateQuery;
