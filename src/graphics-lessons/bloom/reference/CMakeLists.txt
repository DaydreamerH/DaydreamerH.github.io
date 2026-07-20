add_executable(32_bloom main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(32_bloom glfw opengl32)
endif()

foreach(FILE_NAME
    bloom.vs
    bloom.fs
    light_box.fs
    blur.vs
    blur.fs
    bloom_final.vs
    bloom_final.fs
)
    add_custom_command(TARGET 32_bloom POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:32_bloom>/${FILE_NAME}"
    )
endforeach()

foreach(FILE_NAME wood.png container.png)
    add_custom_command(TARGET 32_bloom POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${FILE_NAME}"
        "$<TARGET_FILE_DIR:32_bloom>/${FILE_NAME}"
    )
endforeach()
