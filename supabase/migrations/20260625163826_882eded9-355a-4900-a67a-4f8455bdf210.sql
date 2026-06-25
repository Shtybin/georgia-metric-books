
UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('St. George; Crucifixion of the Saviour | St. George | Crucifixion of the Saviour'::text)),
  '{church,ka}', to_jsonb('წმ. გიორგი; უფლის მაცხოვრის ჯვარცმის | წმ. გიორგი | მაცხოვრის ჯვარცმის'::text)),
  updated_at = now()
WHERE id = 'c1e4e481-98bd-402f-925b-1e6d397a4484';

UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('St. Nicholas; Mother of God'::text)),
  '{church,ka}', to_jsonb('წმ. ნიკოლოზი; ღვთისმშობლის'::text)),
  updated_at = now()
WHERE id = '5cac9b2d-1e77-4acb-9fbb-3666cccb6003';

UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('St. Lazarus; Evangelical Lutheran'::text)),
  '{church,ka}', to_jsonb('წმ. ლაზარე; ევანგელურ-ლუთერული'::text)),
  updated_at = now()
WHERE id = '3b7d064a-0400-43bc-8a8d-92c1883e6637';

UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('Archangel; Archangel / St. George | St. George; Saviour; St. Sophia; St. George; Crucifixion of the Saviour; Saviour | Saviour / St. George'::text)),
  '{church,ka}', to_jsonb('მთავარანგელოზის; მთავარანგელოზის / წმ. გიორგი | წმ. გიორგი; მაცხოვრის; წმ. სოფიოს; წმ. გიორგი; უფლის მაცხოვრის ჯვარცმის; მაცხოვრის | მაცხოვრის / წმ. გიორგი'::text)),
  updated_at = now()
WHERE id = 'af5ab879-7f5a-4d85-a673-dc8e70e95f9d';

UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('Saviour | St. George'::text)),
  '{church,ka}', to_jsonb('მაცხოვრის | წმ. გიორგი'::text)),
  updated_at = now()
WHERE id = '0ec9ed58-239d-4871-bc94-aee7aa0e4c62';

UPDATE feature_overrides SET data = jsonb_set(jsonb_set(data,
  '{church,en}', to_jsonb('40 Martyrs of Sebaste | Archangel | Sts. Kvirike and Ivlita / St. Constantine'::text)),
  '{church,ka}', to_jsonb('40 სებასტიელი მოწამის | მთავარანგელოზის | წმ. კვირიკესა და ივლიტას / წმ. კონსტანტინეს'::text)),
  updated_at = now()
WHERE id = '0d2cdb8b-9eeb-4dfd-91a5-b81d3ec6b77e';
