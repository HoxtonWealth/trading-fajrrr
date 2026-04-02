-- Fix instruments that Capital.com demo doesn't support — move to Yahoo Finance
-- USTEC, JP225 epics aren't valid; WTI can share OIL_CRUDE but better via Yahoo

UPDATE market_assets SET epic = NULL, yahoo_ticker = '^IXIC', data_source = 'external' WHERE symbol = 'NAS100_USD';
UPDATE market_assets SET epic = NULL, yahoo_ticker = '^N225', data_source = 'external' WHERE symbol = 'JP225_USD';
UPDATE market_assets SET epic = NULL, yahoo_ticker = 'CL=F', data_source = 'external' WHERE symbol = 'WTICO_USD';
