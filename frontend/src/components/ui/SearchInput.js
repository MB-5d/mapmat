import React from 'react';
import { Search, X } from 'lucide-react';

import classNames from '../../utils/classNames';
import IconButton from './IconButton';
import TextInput from './TextInput';

const SearchInput = React.forwardRef(
  (
    {
      value = '',
      onChange,
      onClear,
      clearLabel = 'Clear search',
      clearable = true,
      size = 'md',
      inputStyle = 'mono',
      className,
      shellClassName,
      inputClassName,
      ...props
    },
    ref
  ) => {
    const hasValue = String(value ?? '').length > 0;
    const handleClear = (event) => {
      event.preventDefault();
      onClear?.();
    };

    return (
      <TextInput
        ref={ref}
        type="search"
        value={value}
        onChange={onChange}
        size={size}
        inputStyle={inputStyle}
        leftIcon={<Search />}
        rightElement={clearable && hasValue ? (
          <IconButton
            size="xxs"
            variant="ghost"
            htmlType="button"
            className="ui-search-input__clear"
            onClick={handleClear}
            aria-label={clearLabel}
          >
            <X />
          </IconButton>
        ) : null}
        shellClassName={classNames('ui-search-input', className, shellClassName)}
        inputClassName={classNames('ui-search-input__control', inputClassName)}
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

export default SearchInput;
